# Сторонние компоненты и лицензии

Список собран 03.11.2026 из `package-lock.json` и файлов лицензий в `node_modules`. Чужих логотипов, текстов и
изображений в проекте нет: значок на сайте нарисован в коде (SVG), демо-документы синтетические.

## Рабочий сервис (dependencies)

| Компонент | Версия | Лицензия | Зачем |
|---|---|---|---|
| unpdf | 1.8.1 | MIT | текстовый слой PDF в памяти |
| PDF.js (Mozilla), сборка внутри unpdf | в составе unpdf | Apache-2.0 (лицензия проекта PDF.js) | разбор PDF |

## Только для разработки (devDependencies, на хостинге не ставятся: `npm install --omit=dev`)

| Компонент | Версия | Лицензия | Зачем |
|---|---|---|---|
| pdf-lib | 1.17.1 | MIT | демо-PDF (`scripts/make-demo-files.mjs`) |
| @pdf-lib/fontkit | 1.1.1 | MIT | шрифт с кириллицей в демо-PDF |
| @pdf-lib/standard-fonts | 1.0.0 | MIT | зависимость pdf-lib |
| @pdf-lib/upng | 1.0.1 | MIT | зависимость pdf-lib |
| pako | 1.0.11 | MIT и Zlib | зависимость pdf-lib и fontkit |
| tslib | 1.14.1 | 0BSD | зависимость pdf-lib |
| @playwright/test, playwright, playwright-core | 1.64.1 | Apache-2.0 | браузерные тесты |

## Шрифты и ресурсы

| Ресурс | Лицензия | Где |
|---|---|---|
| Noto Sans Regular и Bold | SIL Open Font License 1.1 (`assets/fonts/OFL.txt`) | только в демо-PDF; источник: `assets/fonts/SOURCE.md` |
| Шрифт сайта | системный шрифт пользователя | внешние шрифты не загружаются (раньше загружался Inter с Google Fonts, убран 03.11.2026: это передавало IP посетителя Google) |

## Товарные знаки

Названия Meta, Muse Spark, Google, Gemini, Groq, OpenRouter упоминаются только для описания совместимости и режимов
работы. Логотипы этих компаний не используются. TradeDoc AI не связан с ними и не одобрен ими. Правомерность такого
упоминания: [проверить юристом].
