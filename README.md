# Custom Codex Agent

Интерактивный CLI-агент для анализа и написания кода. Оркестрация работает
через OpenAI Agents SDK, а операции с репозиторием выполняет Codex CLI,
запущенный как MCP-сервер.

## Требования

- Node.js 22 или новее
- установленный Codex CLI
- авторизация Codex CLI через `codex login`
- OpenAI API key для Agents SDK

Авторизация Codex через ChatGPT и API key для Agents SDK независимы. Проверить
ключ без вывода его значения можно так:

```bash
test -n "$OPENAI_API_KEY" && echo "OPENAI_API_KEY is set" || echo "OPENAI_API_KEY is not set"
```

Создать ключ можно в [OpenAI API dashboard](https://platform.openai.com/api-keys).

## Установка

```bash
npm install
cp .env.example .env
```

Укажите ключ в `.env`:

```dotenv
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.5
```

Файл `.env` исключен из Git.

## Запуск

Во время разработки:

```bash
npm run dev
```

Сборка и запуск JavaScript:

```bash
npm run build
npm start
```

Можно открыть другой репозиторий и выбрать режим доступа:

```bash
npm run dev -- --cwd ../my-project --sandbox workspace-write
```

Доступны только `read-only` и `workspace-write`. Интеграция запускает Codex с
`approval-policy: never`, как в официальном примере Agents SDK + Codex MCP.
Изоляцию операций обеспечивает выбранный sandbox; режим полного доступа намеренно
не предоставляется.

## Команды

| Команда | Назначение |
| --- | --- |
| `/help` | Показать команды |
| `/new` | Начать новый диалог и Codex thread |
| `/resume <thread-id>` | Продолжить известный Codex thread |
| `/status` | Показать текущие настройки |
| `/model [model]` | Показать или изменить модель |
| `/permissions [mode]` | Переключить `read-only` / `workspace-write` |
| `/clear` | Очистить экран и начать новый диалог |
| `/exit` | Завершить работу |

История хранится только в памяти процесса. Для остановки текущего запроса нажмите
`Ctrl+C`; повторный `Ctrl+C` в режиме ожидания завершает CLI.

## Вывод действий

Во время выполнения CLI показывает доступные reasoning summaries и события
вызова MCP-инструментов:

```text
Working (3s, Ctrl+C to interrupt)
[reasoning] Нужно сначала изучить структуру проекта.
[action] codex
Working (8s, Ctrl+C to interrupt)
[action completed] codex, thread 019...
agent> Готово...
```

Строка `Working` обновляется каждую секунду и показывает время от начала
текущего пользовательского запроса. Перед выводом reasoning, действий или
ответа она временно очищается, поэтому сообщения не смешиваются между собой.

Это summaries, предоставленные API, а не скрытая цепочка рассуждений модели.
Для отладки можно вывести полные события Agents SDK:

```bash
DEBUG_AGENT_EVENTS=1 npm run dev
```

Codex MCP возвращает свою работу как один tool call. Для показа внутренних
команд, изменений файлов и промежуточных событий Codex потребуется интеграция
через `codex app-server` вместо MCP-инструмента.

## Документация

- [Agents SDK quickstart](https://developers.openai.com/api/docs/guides/agents-sdk/quickstart)
- [Use Codex with the Agents SDK](https://developers.openai.com/codex/guides/agents-sdk)
- [Codex MCP server](https://developers.openai.com/codex/guides/agents-sdk#initialize-codex-cli-as-an-mcp-server)
