# Custom Codex Agent

Интерактивный мультиагентный терминальный клиент для анализа репозиториев и
написания кода. Клиент напрямую подключается к `codex app-server` и выполняет
обязательный workflow маршрутизации для каждого пользовательского запроса.

## Требования

- Node.js 22 или новее
- установленный Codex CLI
- OpenAI API key с доступом к выбранной модели

## Установка и запуск

```bash
npm install
cp .env.example .env
npm run dev
```

Укажите ключ в `.env`:

```dotenv
OPENAI_API_KEY=sk-...
```

Файл `.env` исключен из Git. Использование API key оплачивается через OpenAI
Platform по стандартным API-тарифам и не расходует лимит подписки ChatGPT.

Сборка и запуск JavaScript:

```bash
npm run build
npm start
```

Чтобы открыть другой репозиторий или изменить режим доступа:

```bash
npm run dev -- --cwd ../my-project --sandbox workspace-write
```

Модель `implementer` и необязательный фиксированный reasoning effort задаются
аргументами:

```bash
npm run dev -- --model gpt-5.5 --reasoning-effort xhigh
```

Настройки модели можно добавить в тот же `.env`:

```dotenv
OPENAI_API_KEY=sk-...
CODEX_MODEL=gpt-5.5
CODEX_REASONING_EFFORT=xhigh
```

Без `--reasoning-effort` effort `analyzer` и `implementer` выбирается по
`complexity`: `simple → low`, `normal → medium`, `complex → high`,
`critical → xhigh`. Флаг задаёт фиксированный override только для `implementer`.

Профили по умолчанию:

| Роль | Модель | Effort |
| --- | --- | --- |
| `coordinator` | `gpt-5.4-mini` | `low`, routing и final phases |
| `analyzer` | `gpt-5.4-mini` | по `complexity`, обычно `medium` |
| `implementer` | `gpt-5.5` | по `complexity`, обычно `medium` |

Допустимые значения effort: `none`, `minimal`, `low`, `medium`, `high`, `xhigh`.
Конкретная модель может поддерживать не все уровни. Полный список аргументов
доступен через `npm run dev -- --help`.

## Мультиагентный workflow

Каждый запрос последовательно проходит через роли:

1. `coordinator` в routing phase нормализует запрос, определяет его `complexity`
   и выбирает `analyzer`, `implementer`, обоих или ни одного worker’а.
2. `analyzer`, если выбран, исследует репозиторий в режиме `read-only`. Для
   сложных независимых направлений он может запускать нативных subagents Codex.
3. `implementer`, если выбран, получает отчёт анализатора и единственный имеет
   право изменять workspace.
4. `coordinator` в final phase того же thread формирует итоговый ответ.

`analyzer` и `implementer` создаются как ephemeral thread для каждого запроса.
Thread `coordinator` сохраняется между запросами и содержит обе фазы workflow.

App Server использует отдельный каталог `.codex-data` в корне проекта для
credentials и истории thread. Этот каталог принадлежит приложению; его
`auth.json` следует защищать как пароль. При первом запуске приложение создаёт
`config.toml` с настройкой `forced_login_method = "api"`.

## Доступ и approvals

Поддерживаются sandbox-режимы `read-only` и `workspace-write`. Выбранный режим
применяется только к `implementer`; остальные роли всегда работают в `read-only`.
По умолчанию используется `workspace-write` с approval policy `on-request`. Если
Codex хочет выполнить действие, требующее дополнительного доступа, CLI показывает
запрос на подтверждение. Запросы от нескольких agent thread сериализуются.

## Команды

| Команда | Назначение |
| --- | --- |
| `/help` | Показать команды |
| `/new` | Начать новый мультиагентный workflow |
| `/resume <thread-id>` | Продолжить сохраненный thread координатора |
| `/status` | Показать текущие настройки и thread ID |
| `/agents` | Показать профили ролей и последний маршрут |
| `/model [model] [effort]` | Изменить модель и optional effort override `implementer` |
| `/permissions [mode]` | Переключить sandbox `implementer` |
| `/clear` | Очистить экран и начать новый thread |
| `/exit` | Завершить работу |

`Ctrl+C` во время выполнения отправляет `turn/interrupt` в App Server. В режиме
ожидания `Ctrl+C` завершает CLI.

При выходе выводятся общая статистика токенов, разбивка по ролям и команда для
продолжения thread координатора в нативном Codex CLI:

```text
Token usage: total=144 input=139 (+ 14,592 cached) output=5
To continue this session, run npm run codex -- resume 019ee5a7-aa89-7fd3-8c52-2841d1017de9
```

## Вывод действий

App Server передает события Codex напрямую. CLI показывает активную роль с
таймером, reasoning summaries координатора, команды, изменения файлов, MCP-вызовы,
web search, нативную subagent-активность и потоковый итоговый ответ. Полные
внутренние ответы router’а и worker’ов не выводятся, а передаются координатору.

Reasoning summaries являются краткими сводками, предоставленными Codex, а не
скрытой цепочкой рассуждений модели.

Для диагностики протокола можно запустить CLI с `DEBUG_APP_SERVER=1`.

Проверки для разработки:

```bash
npm run check
npm run build
```

## Архитектура

```text
пользователь
  -> coordinator: routing phase
  -> analyzer? -> native read-only subagents?
  -> implementer?
  -> coordinator: final phase
  -> ответ
```

Клиент запускает App Server в изолированном `CODEX_HOME`, выполняет
`account/login/start` только с типом `apiKey`, затем проверяет `account/read`.
ChatGPT login, device auth и access tokens в клиенте отсутствуют. После
авторизации клиент использует `thread/start`, `thread/resume`, `turn/start`,
`turn/interrupt`, потоковые notifications и server requests для approvals.
Разные роли запускаются на одном соединении App Server с отдельными model,
reasoning effort, developer instructions и sandbox-настройками.

App Server пока относится к экспериментальным интерфейсам Codex, поэтому при
обновлении Codex CLI схема протокола может измениться.

## Документация

- [Codex App Server](https://developers.openai.com/codex/app-server)
- [Codex authentication](https://developers.openai.com/codex/auth)
- [Codex CLI](https://developers.openai.com/codex/cli)
- [Codex security](https://developers.openai.com/codex/security)
