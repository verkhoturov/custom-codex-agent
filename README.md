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
OPENAI_REASONING_EFFORT=xhigh
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

Модель и reasoning effort также можно задать аргументами:

```bash
npm run dev -- --model gpt-5.5 --reasoning-effort xhigh
```

Допустимые значения effort: `none`, `minimal`, `low`, `medium`, `high`,
`xhigh`. Поддержка конкретного уровня зависит от выбранной модели.

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
| `/model [model] [effort]` | Показать или изменить модель и reasoning effort |
| `/permissions [mode]` | Переключить `read-only` / `workspace-write` |
| `/clear` | Очистить экран и начать новый диалог |
| `/exit` | Завершить работу |

История хранится только в памяти процесса. Для остановки текущего запроса нажмите
`Ctrl+C`; повторный `Ctrl+C` в режиме ожидания завершает CLI.

При завершении CLI выводит накопленную статистику внешнего Agents SDK агента и,
если Codex thread уже был создан, команду его продолжения:

```text
Token usage: total=144 input=139 (+ 14,592 cached) output=5
To continue this session, run codex resume 019ee5a7-aa89-7fd3-8c52-2841d1017de9
```

Команда `codex resume` продолжает внутренний Codex thread. In-memory история
внешнего агента между запусками CLI не сохраняется.

## Вывод действий

Во время выполнения CLI показывает доступные reasoning summaries и состояние
работы агента:

```text
Working (3s, Ctrl+C to interrupt)
[reasoning] Нужно сначала изучить структуру проекта.
Working (8s, Ctrl+C to interrupt)
agent> Готово...
```

Строка `Working` обновляется каждую секунду и показывает время от начала
текущего пользовательского запроса. Перед выводом reasoning или ответа она
временно очищается, поэтому сообщения не смешиваются между собой.

Это summaries, предоставленные API, а не скрытая цепочка рассуждений модели.

Codex MCP возвращает свою работу как один tool call. Для показа внутренних
команд, изменений файлов и промежуточных событий Codex потребуется интеграция
через `codex app-server` вместо MCP-инструмента.
Технические события `codex`, `codex-reply`, их завершение и `threadId` в
обычном выводе скрываются; текущий ID доступен через `/status`.

## Документация

- [Agents SDK quickstart](https://developers.openai.com/api/docs/guides/agents-sdk/quickstart)
- [Use Codex with the Agents SDK](https://developers.openai.com/codex/guides/agents-sdk)
- [Codex MCP server](https://developers.openai.com/codex/guides/agents-sdk#initialize-codex-cli-as-an-mcp-server)
