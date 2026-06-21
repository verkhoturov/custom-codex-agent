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
npm run build
npm start
```

Если сохранённой авторизации нет, клиент запросит OpenAI API key и сохранит его в
`.codex-data/auth.json`. При следующих запусках сохранённый логин используется
автоматически. API key оплачивается через OpenAI Platform по стандартным
API-тарифам и не расходует лимит подписки ChatGPT.

### Рабочий каталог агента

По умолчанию агент анализирует и изменяет файлы в каталоге, из которого запущен
клиент. Чтобы агент работал с другим проектом, передайте его каталог через
`--cwd` (короткая форма — `-C`):

```bash
npm start -- --cwd ../my-project
```

Можно указать абсолютный путь:

```bash
npm start -- -C /path/to/my-project
```

Путь из `--cwd` становится рабочим каталогом всех ролей. Чтобы сменить его,
перезапустите клиент с другим значением `--cwd`.

Модель `implementer` и необязательный фиксированный reasoning effort задаются
аргументами:

```bash
npm start -- --model gpt-5.4 --reasoning-effort xhigh
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
доступен через `npm start -- --help`.

## Мультиагентный workflow

Каждый запрос последовательно проходит через роли:

1. `coordinator` в routing phase нормализует запрос, определяет его `complexity`
   и выбирает `analyzer`, `implementer`, обоих или ни одного worker’а.
2. `analyzer`, если выбран, исследует репозиторий в режиме `read-only`. Для
   сложных независимых направлений он может запускать нативных subagents Codex.
3. `implementer`, если выбран, получает отчёт `analyzer`, когда тот запускался, и
   единственный имеет право изменять workspace.
4. `coordinator` в final phase того же thread формирует итоговый ответ.

Каждый выбранный `analyzer` и `implementer` создаётся как ephemeral thread.
Thread `coordinator` сохраняется между запросами и содержит обе фазы workflow.

App Server использует `.codex-data` в корне этого клиентского репозитория для
credentials и истории thread, независимо от значения `--cwd`. Этот каталог
принадлежит приложению; его `auth.json` следует защищать как пароль. Если
`config.toml` отсутствует, приложение создаёт его с настройкой
`forced_login_method = "api"`.

## Доступ и approvals

Поддерживаются sandbox-режимы `read-only` и `workspace-write`. Выбранный режим
применяется только к `implementer`; остальные роли всегда работают в `read-only`.
По умолчанию используется `workspace-write` с approval policy `on-request`. Если
Codex хочет выполнить действие, требующее дополнительного доступа, CLI показывает
запрос на подтверждение. Запросы от нескольких agent thread сериализуются.

## Команды

Актуальный список интерактивных команд и их аргументов доступен через `/help`.
Справка формируется из того же registry, который обрабатывает команды.
Сохранённый thread координатора можно продолжить отдельным запуском:

```bash
npm run resume -- 019ee9d4-8595-7bd0-8933-943b97853c3d -C /path/to/project
```

`Ctrl+C` во время выполнения отправляет `turn/interrupt` в App Server. В режиме
ожидания `Ctrl+C` завершает CLI.

При выходе выводятся общая статистика токенов и разбивка по использованным ролям.

## Вывод действий

App Server передает события Codex напрямую. CLI показывает активную роль с
таймером, reasoning summaries координатора, команды, изменения файлов, MCP-вызовы,
web search, нативную subagent-активность и потоковый итоговый ответ. Полные
внутренние ответы router’а и worker’ов не выводятся, а передаются координатору.

Reasoning summaries являются краткими сводками, предоставленными Codex, а не
скрытой цепочкой рассуждений модели.

## Разработка

Для диагностики протокола запустите `DEBUG_APP_SERVER=1 npm start`.

Проверки для разработки:

```bash
npm run check
npm run build
```

## Архитектура

Клиент запускает App Server в изолированном `CODEX_HOME` и проверяет сохранённую
авторизацию через `account/read`. Если её нет, клиент скрыто запрашивает ключ и
выполняет `account/login/start` только с типом `apiKey`. ChatGPT login, device auth
и access tokens в клиенте отсутствуют. После авторизации клиент использует
`thread/start`, `thread/resume`, `turn/start`, `turn/interrupt`, потоковые
notifications и server requests для approvals. Разные роли запускаются на одном
соединении App Server с отдельными model, reasoning effort, developer instructions
и sandbox-настройками.

App Server пока относится к экспериментальным интерфейсам Codex, поэтому при
обновлении Codex CLI схема протокола может измениться.

## Документация

- [Codex App Server](https://developers.openai.com/codex/app-server)
- [Codex authentication](https://developers.openai.com/codex/auth)
- [Codex CLI](https://developers.openai.com/codex/cli)
- [Codex security](https://developers.openai.com/codex/security)
