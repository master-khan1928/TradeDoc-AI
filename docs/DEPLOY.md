# Деплой

Ничего не деплоилось: инструкция написана по коду и **не проверена на хостинге**.

## Любой хостинг для Node 22+

Node 22 или новее: этого требует зависимость `unpdf` 1.8.1 (`engines.node >= 22`). CI проверяет Node 22 и 24.

```bash
npm ci --omit=dev        # ставится только unpdf; pdf-lib, fontkit и Playwright не нужны
npm start                # порт из PORT, слушает 0.0.0.0
```

Проверка жизни: `GET /healthz` отвечает `ok` (200): это проверка, что процесс жив, а не что модель доступна.
Переменные окружения (значения задаются на хостинге, в репозитории их нет): `LLM_PROVIDER`, `LLM_FALLBACK`,
`LLM_RPM`, `LLM_TIMEOUT_MS`, `LLM_CACHE`, ключ и модель выбранного провайдера (`GEMINI_API_KEY`/`GEMINI_MODEL`,
`GROQ_API_KEY`/`GROQ_MODEL`, `OPENROUTER_API_KEY`/`OPENROUTER_MODEL`, `META_API_KEY`/`META_MODEL`/`META_BASE_URL`),
`PORT`, `RATE_LIMIT_PER_MIN`, `TRUST_PROXY`, `ALLOWED_ORIGINS`.
За прокси с HTTPS задайте `TRUST_PROXY=1`: тогда IP для лимита берётся из `X-Forwarded-For`, а HSTS включается
для запросов, пришедших по HTTPS. Если сайт открывают с другого домена, перечислите его в `ALLOWED_ORIGINS`.

## Railway

1. New Project → Deploy from GitHub repo, корень сервиса: корень репозитория (там лежит `package.json`).
2. Build: `npm ci --omit=dev`. Start: `npm start`. Healthcheck path: `/healthz`.
3. Variables: `LLM_PROVIDER` и ключ провайдера (например, `GEMINI_API_KEY`, `GEMINI_MODEL`), `TRUST_PROXY=1`,
   при необходимости `RATE_LIMIT_PER_MIN`, `LLM_RPM`. Ключи только в Variables, не в репозитории.
4. После деплоя: открыть сайт, убедиться, что значок режима показывает выбранного провайдера, а для бесплатной
   модели виден баннер «демо-режим».

## Что учесть

- Лимиты (по IP и к модели) и кэш демо живут в памяти одного процесса: при нескольких копиях сервиса они не общие.
- Документы на сервере не хранятся; диск и база данных не нужны.
