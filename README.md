# Custom Codex Agent

Интерактивный терминальный клиент для анализа репозиториев и написания кода.
Клиент напрямую подключается к `codex app-server`.

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

Модель и reasoning effort задаются аргументами:

```bash
npm run dev -- --model gpt-5.5 --reasoning-effort xhigh
```

Настройки модели можно добавить в тот же `.env`:

```dotenv
OPENAI_API_KEY=sk-...
CODEX_MODEL=gpt-5.5
CODEX_REASONING_EFFORT=xhigh
```

Допустимые значения effort: `none`, `minimal`, `low`, `medium`, `high`, `xhigh`.
Конкретная модель может поддерживать не все уровни. Полный список аргументов
доступен через `npm run dev -- --help`.

App Server использует отдельный каталог `.codex-data` в корне проекта для
credentials и истории thread. Этот каталог принадлежит приложению; его
`auth.json` следует защищать как пароль. При первом запуске приложение создаёт
`config.toml` с настройкой `forced_login_method = "api"`.

Для запуска нативного Codex CLI с тем же проектным `CODEX_HOME` используйте
wrapper-команду. Она сама передаёт абсолютный путь к `.codex-data`:

```bash
npm run codex
npm run codex -- resume <thread-id>
```

## Доступ и approvals

Поддерживаются sandbox-режимы `read-only` и `workspace-write`. По умолчанию
используется `workspace-write` с approval policy `on-request`. Если Codex хочет
выполнить действие, требующее дополнительного доступа, CLI показывает запрос на
подтверждение.

## Команды

| Команда | Назначение |
| --- | --- |
| `/help` | Показать команды |
| `/new` | Начать новый Codex thread |
| `/resume <thread-id>` | Продолжить сохраненный Codex thread |
| `/status` | Показать текущие настройки и thread ID |
| `/model [model] [effort]` | Показать или изменить модель и effort |
| `/permissions [mode]` | Переключить `read-only` / `workspace-write` |
| `/clear` | Очистить экран и начать новый thread |
| `/exit` | Завершить работу |

`Ctrl+C` во время выполнения отправляет `turn/interrupt` в App Server. В режиме
ожидания `Ctrl+C` завершает CLI.

При выходе выводятся накопленная статистика токенов и команда для продолжения
того же thread в нативном Codex CLI:

```text
Token usage: total=144 input=139 (+ 14,592 cached) output=5
To continue this session, run npm run codex -- resume 019ee5a7-aa89-7fd3-8c52-2841d1017de9
```

## Вывод действий

App Server передает события Codex напрямую. CLI показывает статус `Working` с
таймером, reasoning summaries, команды, изменения файлов, MCP-вызовы, web search
и потоковый ответ агента. Служебные пустые события и thread ID в потоке действий
не выводятся; thread ID доступен через `/status`.

Reasoning summaries являются краткими сводками, предоставленными Codex, а не
скрытой цепочкой рассуждений модели.

Для диагностики протокола можно запустить CLI с `DEBUG_APP_SERVER=1`.

## Архитектура

```text
пользователь -> Custom CLI -> codex app-server -> Codex Agent -> ответ
```

Клиент запускает App Server в изолированном `CODEX_HOME`, выполняет
`account/login/start` только с типом `apiKey`, затем проверяет `account/read`.
ChatGPT login, device auth и access tokens в клиенте отсутствуют. После
авторизации клиент использует `thread/start`, `thread/resume`, `turn/start`,
`turn/interrupt`, потоковые notifications и server requests для approvals.

App Server пока относится к экспериментальным интерфейсам Codex, поэтому при
обновлении Codex CLI схема протокола может измениться.

## Документация

- [Codex App Server](https://developers.openai.com/codex/app-server)
- [Codex authentication](https://developers.openai.com/codex/auth)
- [Codex CLI](https://developers.openai.com/codex/cli)
- [Codex security](https://developers.openai.com/codex/security)
