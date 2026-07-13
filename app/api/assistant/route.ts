import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI, Type, FunctionCallingConfigMode, type FunctionDeclaration } from '@google/genai'
import { getUserFromRequest } from '@/lib/getUser'
import { getAccounts, getCategories, createTxn, createTransfer, getSpaces, getSettings, updateAccount } from '@/lib/finance'
import { createEvent, getSections, createSection, createTask, updateTask } from '@/lib/db'
import { getHabits, setCount } from '@/lib/tracker'
import { getUsage, tryConsumeUsage, FREE_MONTHLY_LIMIT } from '@/lib/assistant'
import { accountValue, depositValue, combinedTotal, formatMoney } from '@/lib/financeCalc'

export const dynamic = 'force-dynamic'

const GEMINI_MODEL = 'gemini-flash-latest'
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

function findByName<T extends { name: string }>(list: T[], name: string): T | null {
  const q = name.trim().toLowerCase()
  return list.find(x => x.name.toLowerCase() === q)
    ?? list.find(x => x.name.toLowerCase().includes(q) || q.includes(x.name.toLowerCase()))
    ?? null
}

export async function GET() {
  const user = await getUserFromRequest()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json(await getUsage(user.userId))
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { text, spaceId: bodySpaceId } = await req.json()
    if (!text?.trim()) return NextResponse.json({ error: 'text required' }, { status: 400 })

    // без выбранного кабинета берём первый (личный создаётся автоматически) — команды
    // вроде задач/событий не требуют финансового контекста, но список счетов нужен всегда
    const spaceId = bodySpaceId || (await getSpaces(user.userId))[0]?.id
    if (!spaceId) return NextResponse.json({ error: 'no_space' }, { status: 400 })

    const usage = await getUsage(user.userId)
    if (usage.count >= usage.limit) {
      return NextResponse.json(
        { error: 'limit_exceeded', message: `Лимит голосовых команд исчерпан (${FREE_MONTHLY_LIMIT}/мес). Попробуйте в следующем месяце.` },
        { status: 429 },
      )
    }

    const [accounts, categories, sections, habits, settings] = await Promise.all([
      getAccounts(spaceId, user.userId),
      getCategories(spaceId, user.userId),
      getSections(user.userId),
      getHabits(user.userId),
      getSettings(user.userId),
    ])
    const expenseCats = categories.filter(c => c.kind === 'expense')
    const incomeCats = categories.filter(c => c.kind === 'income')
    const activeAccounts = accounts.filter(a => !a.archived)
    const activeSections = sections.filter(s => !s.archived)
    const activeHabits = habits.filter(h => !h.archived)
    const depositAccounts = activeAccounts.filter(a => a.type === 'deposit')

    const today = new Date().toISOString().slice(0, 10)
    const accNames = activeAccounts.map(a => a.name).join(', ') || '(счетов пока нет — используй ask_clarification для любой финансовой команды)'
    const expCatNames = expenseCats.map(c => c.name).join(', ')
    const incCatNames = incomeCats.map(c => c.name).join(', ')
    const sectionNames = activeSections.map(s => s.name).join(', ') || '(списков пока нет — попадёт во «Входящие»)'
    const depositNames = depositAccounts.map(a => a.name).join(', ') || '(депозитов в этом кабинете нет)'
    const habitNames = activeHabits.map(h => {
      const c = h.counts[today] ?? 0
      return h.targetPerDay > 1 ? `${h.name} (сейчас ${c}/${h.targetPerDay} за сегодня)` : h.name
    }).join(', ') || '(привычек пока нет)'

    const tools: FunctionDeclaration[] = [
      {
        name: 'add_expense',
        description: 'Записать расход со счёта',
        parameters: {
          type: Type.OBJECT,
          properties: {
            accountName: { type: Type.STRING, description: `Название счёта, одно из: ${accNames}` },
            amount: { type: Type.NUMBER, description: 'Сумма расхода, положительное число' },
            category: { type: Type.STRING, description: `Категория расхода, одно из: ${expCatNames}` },
            comment: { type: Type.STRING, description: 'Короткий комментарий, если был назван' },
          },
          required: ['accountName', 'amount', 'category', 'comment'],
        },
      },
      {
        name: 'add_income',
        description: 'Записать доход на счёт',
        parameters: {
          type: Type.OBJECT,
          properties: {
            accountName: { type: Type.STRING, description: `Название счёта, одно из: ${accNames}` },
            amount: { type: Type.NUMBER, description: 'Сумма дохода, положительное число' },
            category: { type: Type.STRING, description: `Категория дохода, одно из: ${incCatNames}` },
            comment: { type: Type.STRING, description: 'Короткий комментарий, если был назван' },
          },
          required: ['accountName', 'amount', 'category', 'comment'],
        },
      },
      {
        name: 'add_transfer',
        description: 'Перевести деньги между двумя своими счетами',
        parameters: {
          type: Type.OBJECT,
          properties: {
            fromAccountName: { type: Type.STRING, description: `Счёт-источник, одно из: ${accNames}` },
            toAccountName: { type: Type.STRING, description: `Счёт-получатель, одно из: ${accNames}` },
            amount: { type: Type.NUMBER, description: 'Сумма перевода, положительное число' },
          },
          required: ['fromAccountName', 'toAccountName', 'amount'],
        },
      },
      {
        name: 'add_event',
        description: 'Добавить событие/встречу в календарь',
        parameters: {
          type: Type.OBJECT,
          properties: {
            date: { type: Type.STRING, description: `Дата в формате YYYY-MM-DD. Сегодня: ${today}` },
            time: { type: Type.STRING, description: 'Время начала HH:MM, пустая строка если весь день' },
            title: { type: Type.STRING, description: 'Название события' },
          },
          required: ['date', 'time', 'title'],
        },
      },
      {
        name: 'add_task',
        description: 'Добавить задачу/напоминание в список дел (без конкретного времени встречи — для этого есть add_event)',
        parameters: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: 'Текст задачи' },
            sectionName: { type: Type.STRING, description: `Название списка, куда добавить, одно из: ${sectionNames}. Пустая строка, если не назван — попадёт в список по умолчанию.` },
            dueDate: { type: Type.STRING, description: `Дедлайн в формате YYYY-MM-DD, если назван (например "к пятнице", "до 20 июля"). Пустая строка, если не назван. Сегодня: ${today}` },
          },
          required: ['title', 'sectionName', 'dueDate'],
        },
      },
      {
        name: 'mark_habit',
        description: 'Отметить прогресс по привычке из трекера на сегодня (в т.ч. частично, для привычек с несколькими подходами в день)',
        parameters: {
          type: Type.OBJECT,
          properties: {
            habitName: { type: Type.STRING, description: `Название привычки, одно из: ${habitNames}` },
            count: {
              type: Type.INTEGER,
              description:
                'Сколько раз выполнено СЕГОДНЯ ВСЕГО (не дельта). Для обычной привычки: 1 — выполнено, 0 — снять отметку/не сделал. ' +
                'Для привычки с несколькими подходами: посчитай итоговое число с учётом текущего прогресса из описания (например "ещё один подход" при текущем 1/4 → 2).',
            },
          },
          required: ['habitName', 'count'],
        },
      },
      {
        name: 'topup_deposit',
        description: 'Пополнить депозит своими деньгами (тело депозита увеличивается на сумму)',
        parameters: {
          type: Type.OBJECT,
          properties: {
            accountName: { type: Type.STRING, description: `Название депозита, одно из: ${depositNames}` },
            amount: { type: Type.NUMBER, description: 'Сумма пополнения, положительное число' },
          },
          required: ['accountName', 'amount'],
        },
      },
      {
        name: 'accrue_interest',
        description: 'Начислить проценты по депозиту за месяц (по текущей ставке депозита)',
        parameters: {
          type: Type.OBJECT,
          properties: {
            accountName: { type: Type.STRING, description: `Название депозита, одно из: ${depositNames}` },
          },
          required: ['accountName'],
        },
      },
      {
        name: 'get_balance',
        description: 'Узнать баланс одного счёта или общий баланс всего кабинета — ничего не создаёт и не меняет, только отвечает',
        parameters: {
          type: Type.OBJECT,
          properties: {
            accountName: { type: Type.STRING, description: `Название счёта, одно из: ${accNames}. Пустая строка — общий баланс кабинета.` },
          },
          required: ['accountName'],
        },
      },
      {
        name: 'ask_clarification',
        description: 'Использовать, если команда неоднозначна или не хватает данных (например, неясен счёт или сумма)',
        parameters: {
          type: Type.OBJECT,
          properties: { question: { type: Type.STRING, description: 'Короткий уточняющий вопрос на русском' } },
          required: ['question'],
        },
      },
    ]

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: text.trim(),
      config: {
        systemInstruction:
          'Ты — голосовой ассистент приложения Pen (финансы, календарь, задачи, трекер привычек). ' +
          'Пользователь надиктовал команду на русском (возможны неточности распознавания речи). ' +
          'Выбери ровно один инструмент, который точно соответствует команде. ' +
          'add_event — только для встреч с конкретным временем/датой; add_task — для обычных дел и напоминаний без точного времени; ' +
          'mark_habit — если пользователь говорит, что сделал (или не сделал) что-то из своих привычек в трекере, в т.ч. частично ("ещё один подход", "выпил 2 стакана из 4"). ' +
          'topup_deposit — пополнить депозит своими деньгами; accrue_interest — начислить проценты по депозиту за месяц; get_balance — только ответить на вопрос о балансе, ничего не меняя. ' +
          'Если что-то важное неясно (не назван счёт, сумма или дата) — вызови ask_clarification. ' +
          'Даты вроде "завтра", "послезавтра", "20 июля", "к пятнице" переводи в YYYY-MM-DD относительно сегодняшней даты.',
        tools: [{ functionDeclarations: tools }],
        toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY } },
      },
    })

    const call = response.functionCalls?.[0]
    if (!call) {
      return NextResponse.json({ message: 'Не удалось разобрать команду. Попробуйте сформулировать иначе.' })
    }
    const toolUse = { name: call.name, input: call.args as any }

    const consumed = await tryConsumeUsage(user.userId)
    if (!consumed) {
      return NextResponse.json(
        { error: 'limit_exceeded', message: `Лимит голосовых команд исчерпан (${FREE_MONTHLY_LIMIT}/мес). Попробуйте в следующем месяце.` },
        { status: 429 },
      )
    }

    const input = toolUse.input as any

    if (toolUse.name === 'ask_clarification') {
      return NextResponse.json({ message: input.question })
    }

    if (toolUse.name === 'add_expense' || toolUse.name === 'add_income') {
      if (activeAccounts.length === 0) return NextResponse.json({ message: 'Сначала добавьте счёт в разделе «Финансы».' })
      const acc = findByName(activeAccounts, input.accountName)
      if (!acc) return NextResponse.json({ message: `Не нашёл счёт «${input.accountName}». Есть: ${accNames}.` })
      const cats = toolUse.name === 'add_expense' ? expenseCats : incomeCats
      const cat = findByName(cats, input.category)
      const { txn } = await createTxn(user.userId, {
        accountId: acc.id, type: toolUse.name === 'add_expense' ? 'expense' : 'income',
        amount: Number(input.amount), category: cat?.id ?? '', comment: input.comment ?? '',
      })
      const verb = toolUse.name === 'add_expense' ? 'Расход' : 'Доход'
      return NextResponse.json({
        message: `✓ ${verb} ${txn.amount} ${acc.currency} · ${acc.name}${cat ? ' · ' + cat.name : ''}`,
        action: toolUse.name, spaceId,
      })
    }

    if (toolUse.name === 'add_transfer') {
      if (activeAccounts.length === 0) return NextResponse.json({ message: 'Сначала добавьте счёт в разделе «Финансы».' })
      const from = findByName(activeAccounts, input.fromAccountName)
      const to = findByName(activeAccounts, input.toAccountName)
      if (!from || !to) return NextResponse.json({ message: `Не нашёл счёт(а). Есть: ${accNames}.` })
      const txn = await createTransfer(user.userId, { fromAccountId: from.id, toAccountId: to.id, amount: Number(input.amount) })
      return NextResponse.json({
        message: `✓ Перевод ${txn.amount} ${from.currency} · ${from.name} → ${to.name}`,
        action: 'add_transfer', spaceId,
      })
    }

    if (toolUse.name === 'add_event') {
      const ev = await createEvent(user.userId, { day: input.date, time: input.time || undefined, title: input.title })
      return NextResponse.json({
        message: `✓ ${ev.title} · ${ev.day}${ev.time ? ' в ' + ev.time : ''}`,
        action: 'add_event',
      })
    }

    if (toolUse.name === 'mark_habit') {
      if (activeHabits.length === 0) return NextResponse.json({ message: 'В трекере пока нет привычек.' })
      const habit = findByName(activeHabits, input.habitName)
      if (!habit) return NextResponse.json({ message: `Не нашёл привычку «${input.habitName}». Есть: ${habitNames}.` })
      const { count, done } = await setCount(habit.id, user.userId, today, Number(input.count))
      const progress = habit.targetPerDay > 1 ? ` (${count}/${habit.targetPerDay})` : ''
      return NextResponse.json({
        message: `✓ ${habit.emoji} ${habit.name}${progress} — ${done ? 'выполнено' : count > 0 ? 'записано' : 'отметка снята'}`,
        action: 'mark_habit',
      })
    }

    if (toolUse.name === 'add_task') {
      let section = input.sectionName ? findByName(activeSections, input.sectionName) : null
      if (!section) section = activeSections[0] ?? null
      if (!section) section = await createSection('Входящие', user.userId)
      const task = await createTask(section.id, input.title, user.userId)
      if (!task) return NextResponse.json({ message: 'Не удалось добавить задачу.' })
      if (input.dueDate) await updateTask(task.id, { dueDate: input.dueDate }, user.userId)
      return NextResponse.json({
        message: `✓ ${task.title} · ${section.name}${input.dueDate ? ' · до ' + input.dueDate : ''}`,
        action: 'add_task',
      })
    }

    if (toolUse.name === 'topup_deposit') {
      if (depositAccounts.length === 0) return NextResponse.json({ message: 'В этом кабинете нет депозитов.' })
      const acc = findByName(depositAccounts, input.accountName)
      if (!acc) return NextResponse.json({ message: `Не нашёл депозит «${input.accountName}». Есть: ${depositNames}.` })
      const principal = Math.round((acc.principal + Number(input.amount)) * 100) / 100
      await updateAccount(acc.id, user.userId, { principal })
      return NextResponse.json({
        message: `✓ Депозит «${acc.name}» пополнен на ${formatMoney(Number(input.amount), acc.currency)}`,
        action: 'topup_deposit', spaceId,
      })
    }

    if (toolUse.name === 'accrue_interest') {
      if (depositAccounts.length === 0) return NextResponse.json({ message: 'В этом кабинете нет депозитов.' })
      const acc = findByName(depositAccounts, input.accountName)
      if (!acc) return NextResponse.json({ message: `Не нашёл депозит «${input.accountName}». Есть: ${depositNames}.` })
      const rate = depositValue(acc, today).currentRate
      if (rate == null || acc.principal <= 0) return NextResponse.json({ message: `У депозита «${acc.name}» не задана ставка.` })
      const interest = Math.round((acc.principal * rate / 1200) * 100) / 100
      const principal = Math.round((acc.principal + interest) * 100) / 100
      await updateAccount(acc.id, user.userId, { principal, startDate: today })
      return NextResponse.json({
        message: `✓ Начислено ${formatMoney(interest, acc.currency)} процентов на «${acc.name}»`,
        action: 'accrue_interest', spaceId,
      })
    }

    if (toolUse.name === 'get_balance') {
      if (input.accountName) {
        const acc = findByName(activeAccounts, input.accountName)
        if (!acc) return NextResponse.json({ message: `Не нашёл счёт «${input.accountName}». Есть: ${accNames}.` })
        return NextResponse.json({ message: `${acc.name}: ${formatMoney(accountValue(acc, today), acc.currency)}` })
      }
      const { total, missing } = combinedTotal(activeAccounts, today, settings)
      const suffix = missing.length ? ` (не учтено: ${missing.join(', ')} — нет курса)` : ''
      return NextResponse.json({ message: `Всего в кабинете: ${formatMoney(total, settings.baseCurrency)}${suffix}` })
    }

    return NextResponse.json({ message: 'Не удалось выполнить команду.' })
  } catch (e) {
    console.error('POST /api/assistant error:', e)
    return NextResponse.json({ error: 'failed', message: 'Что-то пошло не так. Попробуйте ещё раз.' }, { status: 500 })
  }
}
