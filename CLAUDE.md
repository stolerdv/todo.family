# Pen

Личное PWA-приложение Данила «для организации жизни» (себя и жены). Называется **Pen** (лого — ручка с фигурой человека, чёрный фон; `app/icon.png`, `public/icon-192.png|icon-512.png|apple-icon.png`; тема `#000000`). Next.js 14 (App Router) + Neon (Postgres) + JWT-авторизация, задеплоено на **Vercel** (тот же проект). Установочное на телефон, тёмная тема, мобайл-фёрст, русский язык интерфейса. ВАЖНО: `middleware.ts` matcher исключает статику/манифест/иконки (иначе PWA-иконки редиректит на /login).

## Навигация (каркас)
Три раздела маршрутизируются в группе `app/(main)/` с общим `app/(main)/layout.tsx`: колонка `h-[100dvh]` → скроллящийся контент сверху + **нижняя панель `components/BottomNav.tsx`** (Трекер/Финансы/Напоминания), всегда видна. URL: `/tracker`, `/finance`, `/app`. Внутри раздела — своя навигация ВВЕРХУ (у трекера под-вкладки «Сегодня/Статистика» + FAB «+»; у финансов FAB для операции). НЕ добавлять вторые нижние бары внутри разделов. (Старый `SectionSwitcher` удалён.)

1. **Трекер** привычек — `/tracker` (готов).
2. **Напоминания** (то-ду) — `/app` (ядро проекта, НЕ ломать; его раскладка `flex h-full`, каркас даёт высоту).
3. **Финансы** — `/finance` (готов): счета (баланс правится вручную), операции доход/расход (меняют баланс), умный депозит, мультивалюта.

Корень `/` → редирект на `/tracker` (стартовый экран; легко поменять). Всё, кроме `/login /register /join`, защищено `middleware.ts` (кука `auth_token`, JWT через `jose`).

## Технологии и конвенции
- Данные: `@neondatabase/serverless`, `neon(process.env.DATABASE_URL)`. Строка в `.env.local` (и в env Vercel). Таблицы префиксуются по разделу: `todo_*`, `tracker_*` (для финансов — `finance_*`). Пользователи — `todo_users` (id uuid). Запросы всегда скоупить по `user_id`.
- Авторизация: `lib/auth.ts` (sign/verify JWT), `lib/getUser.ts` (`getUserFromRequest()` из куки). Шаринг между людьми — паттерн `todo_section_members` + share-код (см. `lib/db.ts`).
- Стили: Tailwind. Раздел «Трекер» использует собственный CSS с префиксом **`tk-`** (`app/tracker/tracker.css`), чтобы не конфликтовать с утилитами Tailwind (`.block`, `.flex` и т.п.). Свитчер и todo — на Tailwind.

## Раздел «Трекер» (карта файлов)
- `lib/tracker.ts` — слой данных (getHabits/create/update/delete, setCompletion). Типы `Habit`, `Schedule`.
- `lib/trackerStats.ts` — клиентский расчёт (серии, %, тепловая карта, недели). Ключевая метрика — **«серия без пропусков»** (`globalStreak`): дней подряд, когда выполнены ВСЕ привычки дня; дни без запланированных привычек нейтральны; сегодня с поблажкой.
- `app/tracker/page.tsx` — вся UI (экраны Сегодня / привычка / Статистика + шторка добавления), клиентский, тянет данные из API с оптимистичным обновлением.
- `app/api/tracker/habits/route.ts`, `.../[id]/route.ts`, `app/api/tracker/completions/route.ts` — API.
- Схема: `tracker_habits` (id, user_id, name, description, emoji, color, schedule jsonb, start_date, archived, sort_order, created_at), `tracker_completions` (habit_id, day, PK(habit_id,day)), каскадное удаление. Расписание: `{type:'daily'}` | `{type:'weekdays',days:[0..6]}` (Пн=0) | `{type:'count',perWeek:N}`.

## Деплой
`git push` → Vercel пересобирает тот же проект на том же домене. Neon — та же база (`DATABASE_URL`). Миграции применяются вручную скриптом через `@neondatabase/serverless` (пример — как создавались `tracker_*` таблицы).

## Раздел «Финансы» (карта файлов)
- `lib/finance.ts` — данные: счета (`finance_accounts`), ставки депозита (`finance_deposit_rates`), настройки/курсы (`finance_settings`), операции (`finance_txns`). Типы `Account`, `DepositRate`, `Txn`, `FinanceSettings`, `AccountType`, `TxnType`. numeric → `::float8`. `createTxn`/`deleteTxn` меняют баланс счёта **атомарно** через `q.transaction([...])`.
- `lib/financeCalc.ts` — `depositValue` (учитывает капитализацию: `monthly` → помесячное сложение номинальной ставки, `none` → простое; между периодами баланс переносится), `effectiveRate` (номинал→эффективная годовая), `accountValue`, `convert`/`combinedTotal` (пересчёт в базовую валюту по ручным курсам), `formatMoney`, `EXPENSE_CATEGORIES`/`INCOME_CATEGORIES`/`categoryMeta`, `ACCOUNT_TYPES`.
- `app/(main)/finance/page.tsx` — UI: список (итог по валютам + общий ≈ в базовой + «Курсы»; счета; последние операции), детали счёта (+ операции; для депозита — капитализация/эффективная ставка/менеджер ставок), быстрая операция (расход/доход → счёт → сумма → категория → коммент), формы счёта и курсов. FAB = добавить операцию. Стили: `../tracker/tracker.css` (`tk-`) + `finance.css` (`fin-`).
  Настройки — шестерёнка ⚙ в шапке → меню: Курсы валют / Категории / Бюджеты (компоненты `SettingsMenu`, `RatesSheet`, `CategoriesSheet`, `BudgetsSheet`). Валюты ограничены `₸ € $` (`CURRENCIES` в page). Операция поддерживает 3 типа: расход/доход/**перевод**.
- API: `accounts` (+`[id]`), `rates` (+`[id]`), `txns` (+`[id]`), `settings` (GET/PUT), `categories` (+`[id]`), `budgets` (GET/PUT), `transfers` (POST).
- Схема: `finance_accounts` (…, capitalization monthly|none), `finance_deposit_rates`, `finance_settings` (user_id PK, base_currency, rates jsonb), `finance_txns` (type **expense|income|transfer**, category=**id категории**, +`to_account_id`,`to_amount` для переводов), `finance_categories` (user-managed, kind expense|income, name, emoji; сидятся дефолтом при первом GET), `finance_budgets` (category_id UNIQUE, amount — месячный лимит в базовой валюте).

Модель: учёт **по балансам** + операции доход/расход/перевод (двигают баланс атомарно через `q.transaction`). Категории **пользовательские** (добавляй/удаляй без кода). Бюджеты — лимит на категорию/мес, прогресс на экране (`categorySpend`). Мультивалюта — ручные курсы к базовой (не онлайн). **Ещё нет (следующее, важно для Данила):** ШАРИНГ С ЖЕНОЙ — общий семейный доступ к финансам (см. ниже), переводы кросс-валютные уже есть (вводится сумма зачисления).
