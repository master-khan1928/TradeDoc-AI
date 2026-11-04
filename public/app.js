// Скрипт страницы TradeDoc AI. Вынесен из index.html: строгая CSP без 'unsafe-inline'.
import * as CS from "./case-store.js";
import { mockExtract } from "/shared/mock.js";
(() => {
  "use strict";
  const T = {
    ru: {
      eyebrow:"Для экспедиторов и малых экспортёров Центральной Азии", h1a:"Находим расхождения в документах груза", h1b:"до выезда машины.",
      lead:"Проверяем комплект документов до выезда машины. Код сверяет цифры и названия, у каждого замечания есть цитата и страница. Если ошибка у партнёра, готовим письмо с просьбой подтвердить верное значение. Значений мы не предлагаем.",
      pack:"Комплект документов", d_invoice:"Инвойс", d_packing:"Упаковочный лист", synthetic:"синтетика",
      run:"Проверить комплект", edit_hint:"Исправьте значение в тексте и проверьте заново: результат обновится.",
      passed_label:"Итог проверки", st_found:"найдено расхождений", st_notfound:"расхождений не найдено", st_review:"нужна проверка человеком", st_nodata:"нет данных для проверки",
      pr_log:"Журнал проверки (для воспроизведения результата)", pr_log_at:"Время", pr_log_app:"Версия приложения", pr_log_model:"Режим и модель", pr_log_rules:"Каталог правил", pr_log_docs:"Документы (SHA-256 текста; файла, если загружен)", findings:"Замечания", letter_h:"Письмо партнёру", mk_letter:"Составить письмо", copy:"Копировать", copied:"Скопировано",
      letter_note:"Письмо содержит только факты и просьбу подтвердить значения. Подставлять значения должна сторона, отвечающая за документ.",
      inspector:"Инспектор", all_checks:"Все проверки",
      insp_note:"Правила демонстрационные (needs_review): без источников и дат проверки. Нет подходящего правила, нет и вопроса.",
      insp_none:"Вопросов нет.", no_rule:"Без правила в каталоге: ",
      no_findings:"Расхождений не найдено.", fixed:"Исправлено", added:"Новое", still:"Осталось",
      demo_label:"демо-чтение (MOCK, не ИИ)", meta_label:"чтение: Meta", ai_label:"чтение: {label} · {model}", free_tag:"бесплатный тариф",
      meta_waiting:"Слой Meta подготовлен, ждём ключ. Сейчас режим: {mode}.",
      demo_banner:"Демо-режим: бесплатная модель {label}. Не загружайте реальные документы: на бесплатном тарифе провайдер может использовать данные для улучшения своих продуктов. Только синтетические документы.",
      r_rate_free:"Причина: лимит бесплатной модели исчерпан. Попробуйте через минуту.", r_rate_local:"Причина: сработал наш лимит частоты запросов к бесплатной модели. Подождите минуту.",
      e_real_data_suspected:"В документе похоже есть реальные персональные данные ({markers}). В демо-режиме принимаются только синтетические документы, в модель ничего не отправлено.",
      e_real_data_after:"В расшифровке фото похоже есть реальные персональные данные ({markers}). Результат отброшен. В демо-режиме загружайте только синтетические документы.",
      m_iin:"ИИН/БИН", m_email:"e-mail", m_phone:"телефон", m_iban:"IBAN", m_passport:"паспорт",
      fallback_note:"Основной провайдер ({from}) недоступен: лимит или сбой. Документы прочитала резервная модель {label} · {model}.",
      cached_note:"Из кэша: {n} док. (тот же текст уже читался, лимит не расходуется).", masked_note:"Перед отправкой в модель скрыто: {list}.",
      mk_person:"ФИО", mk_iin:"ИИН/БИН", mk_email:"e-mail", mk_phone:"телефон", mk_iban:"IBAN", mk_passport:"паспорт",
      ai_down:"ИИ недоступен: документы прочитаны демо-разбором по шаблону.",
      r_auth:"Причина: ключ не принят или нет доступа к модели (401/403).", r_model:"Причина: неверный идентификатор модели META_MODEL (404).",
      r_rate:"Причина: превышен лимит запросов (429). Попробуйте через минуту.", r_timeout:"Причина: модель не ответила вовремя.",
      r_network:"Причина: нет связи с сервером модели.", r_server:"Причина: ошибка на стороне сервиса модели (5xx).",
      r_bad_response:"Причина: ответ модели не по схеме.", r_bad_request:"Причина: сервис отклонил запрос (400). Возможно, модель не принимает изображения.",
      e_client_timeout:"Ответ не пришёл вовремя. Попробуйте ещё раз.",
      json_fb:"запасной режим JSON", json_fb_note:"Сервис модели не принял строгую схему ответа (json_schema). Документы прочитаны в запасном режиме «верни JSON»; цитаты проверены кодом так же.",
      disclaimer:"TradeDoc AI: справка и черновики, не таможенная консультация. Все документы в примерах синтетические, компании вымышленные. Сервер документы не сохраняет; дело груза хранится только в вашем браузере.",
      reading_note:"Режим MOCK читает текст по шаблону «Метка: значение» и не использует ИИ. Текстовый слой PDF извлекает код, без ИИ. Фото и сканы читает только модель выбранного провайдера (бесплатная модель или Meta). Сверку всегда делает код.",
      sev_high:"высокая", sev_medium:"средняя", demo:"демо", loading:"Проверяю…", err:"Не удалось проверить. Попробуйте ещё раз.", page:"стр.",
      sample_btn:"Пример: ",
      drop_text:"Перетащите сюда PDF, фото или текстовые файлы.", drop_note:"До 1,5 МБ на файл. Тип документа определим по содержимому. Файлы не сохраняются.",
      pick_files:"Выбрать файлы", pick_one:"Файл", own_file:"ваш файл",
      reading:"Читаю файл…", st_pdf:"Из PDF: {name}, страниц: {pages}. Текст извлечён кодом, без ИИ.", st_text:"Из файла {name}.",
      st_photo:"С фото: {name}. Прочитано моделью, подтвердите значения вручную.", st_dropped:"Отброшено полей без цитаты: {n}.",
      st_edited:"Текст изменён вручную после загрузки.", st_placed:"{name}: определён как «{doc}».",
      unknown_type:"{name}: не удалось определить тип документа. Загрузите его кнопкой «Файл» в нужной колонке.",
      photo_tag:"прочитано с фото, подтвердите вручную", confirm_h:"Подтвердите вручную",
      e_file_too_large:"Файл больше 1,5 МБ. Сожмите его или загрузите по страницам.",
      e_unsupported_format:"Этот формат не поддерживается. Подходят PDF, JPG, PNG, WEBP и TXT.",
      e_photo_needs_ai:"Для чтения фото нужен режим ИИ: бесплатная модель или Meta. Сейчас MOCK: загрузите PDF с текстовым слоем или текст.",
      e_pdf_no_text:"В PDF нет текстового слоя (похоже на скан). Загрузите страницы как фото: их читает модель в режиме META.",
      e_pdf_unreadable:"PDF не читается: файл повреждён или защищён паролем.", e_pdf_timeout:"PDF читается слишком долго. Попробуйте файл поменьше.",
      e_doc_too_long:"Документ длиннее 20 000 символов.", e_empty_file:"Файл пустой.",
      e_ai_unavailable:"Модель не смогла прочитать изображение. Попробуйте ещё раз или загрузите PDF.", e_other:"Не удалось прочитать файл.",
      e_pdf_active_content:"PDF содержит активное содержимое (скрипты, вложения или формы) и не принимается. Сохраните документ заново как обычный PDF.", e_pdf_too_many_pages:"В PDF больше 20 страниц. Загрузите только нужные страницы.",
      e_too_many_requests:"Слишком много запросов. Подождите минуту и попробуйте снова.", e_origin_not_allowed:"Запрос отклонён: он пришёл не с сайта TradeDoc AI.",
      case_h:"Дело груза", case_pick:"Выбрать дело", case_new:"Новое дело", case_del:"Удалить дело", case_wipe:"Удалить все мои данные",
      consent_text:"Я принимаю Условия использования и Политику конфиденциальности и даю согласие на обработку данных. В демо-режиме бесплатной модели загружаю только синтетические документы.",
      legal_docs:"Документы (черновики):", l_TERMS:"Условия", l_PRIVACY:"Политика конфиденциальности", l_CONSENT:"Согласие", l_DISCLAIMER:"Отказ от ответственности",
      consent_needed:"Чтобы загрузить и проверить документы, отметьте согласие выше.",
      ai_mark_ai:"Подготовлено с помощью ИИ: {label} · {model}. Сверку сделал код; проверьте замечания по оригиналам.", ai_mark_mock:"Подготовлено автоматически, без ИИ (разбор по шаблону). Проверьте замечания по оригиналам.",
      disclaimer_short:"Сервис вспомогательный: не таможенный брокер и не юрист, не даёт юридических советов и не гарантирует прохождение границы. Результаты ИИ могут содержать ошибки. За итоговые документы отвечает пользователь.",
      case_name:"Рейс (название, номер машины)", case_dep:"Дата выезда", case_docs:"Версии документов", case_hist:"История проверок",
      case_note:"Дело хранится только в этом браузере (localStorage): тексты документов, версии и история проверок. На сервер оно не отправляется и там не хранится. «Удалить всё» стирает все дела на этом устройстве.",
      case_untitled:"Рейс без названия", no_versions:"нет версий", no_checks:"Проверок ещё не было.",
      due_in:"до выезда дней: {n}", due_today:"выезд сегодня", due_past:"дата выезда прошла",
      wipe_confirm:"Удалить из этого браузера все мои данные: дела, версии документов, историю проверок, согласие и настройки? Отменить нельзя.", del_confirm:"Удалить это дело из браузера?",
      st_err_quota:"Не удалось сохранить: место в браузере закончилось. Удалите старые дела.",
      st_err_unavailable:"Браузер не разрешает сохранять данные (например, приватный режим). Проверка работает, но дело не сохранится.",
      st_err_partial:"Часть сохранённых дел была повреждена и пропущена; остальные открыты.", st_err_too_large:"Дело стало слишком большим для хранения в браузере (больше 2 МБ). Удалите старые дела или версии.",
      st_err_corrupt:"Сохранённые дела повреждены и не прочитаны. Можно начать заново или нажать «Удалить всё».",
      st_restored:"Из дела: версия v{v}{namePart}.",
      h_changed:"изменены", h_fixed:"исправлено", h_added:"новое", h_still:"осталось замечаний", h_first:"первая проверка в деле",
      diff_first:"{doc} v{v}: первая сохранённая версия, сравнивать не с чем.", diff_head:"{doc}: v{a} → v{b}. Удалено строк: {d}, добавлено: {p}.", diff_same:"Текст не изменился.",
      fix_type:"Какой документ исправлен", fix_btn:"Загрузить исправленный документ", print_btn:"Печать / PDF",
      pr_title:"TradeDoc AI: отчёт о проверке комплекта", pr_case:"Дело", pr_dep:"Дата выезда", pr_at:"Проверено", pr_mode:"Чтение",
      pr_docs:"Документы", pr_result:"Результат", pr_passed:"Пройдено проверок: {p} из {t}. Пропущено: {s}.", pr_changes:"Изменения с прошлой проверки",
      pr_findings:"Замечания", pr_none:"Расхождений среди проверенного не найдено.", pr_confirm:"Подтвердите вручную",
      pr_novals:"Отчёт показывает, что и где написано. Верные значения подтверждает сторона, отвечающая за документ: система их не предлагает.",
      mode_mock:"демо-чтение по шаблону (MOCK), не ИИ", mode_ai:"модель {label} · {model}, цитаты проверены кодом", mode_free:"бесплатный тариф, только синтетические документы",
      src_pdf:"из PDF", src_photo:"с фото, подтвердите вручную", src_text:"текст", ql:"«", qr:"»",
    },
    en: {
      eyebrow:"For freight forwarders and small exporters in Central Asia", h1a:"We find discrepancies in the cargo documents", h1b:"before the truck leaves.",
      lead:"We check the document pack before the truck leaves. Code compares the numbers and names, and every finding shows its quote and page. If the error is on a partner's side, we prepare a letter asking them to confirm the correct value. We never suggest values.",
      pack:"Document pack", d_invoice:"Invoice", d_packing:"Packing list", synthetic:"synthetic",
      run:"Check the pack", edit_hint:"Edit a value in the text and check again: the result updates.",
      passed_label:"Check result", st_found:"differences found", st_notfound:"no differences found", st_review:"needs a human check", st_nodata:"no data to check",
      pr_log:"Check log (to reproduce the result)", pr_log_at:"Time", pr_log_app:"App version", pr_log_model:"Mode and model", pr_log_rules:"Rules catalog", pr_log_docs:"Documents (SHA-256 of the text; of the file, if uploaded)", findings:"Findings", letter_h:"Letter to the partner", mk_letter:"Write the letter", copy:"Copy", copied:"Copied",
      letter_note:"The letter contains facts only and a request to confirm the values. The party responsible for the document must supply them.",
      inspector:"Inspector", all_checks:"All checks",
      insp_note:"Rules are a demo set (needs_review): no sources or check dates. No matching rule means no question.",
      insp_none:"No questions.", no_rule:"No rule in the catalog for: ",
      no_findings:"No differences found.", fixed:"Fixed", added:"New", still:"Remaining",
      demo_label:"demo reading (MOCK, not AI)", meta_label:"reading: Meta", ai_label:"reading: {label} · {model}", free_tag:"free tier",
      meta_waiting:"The Meta layer is ready and waiting for a key. Current mode: {mode}.",
      demo_banner:"Demo mode: free model {label}. Do not upload real documents: on the free tier the provider may use the data to improve its products. Synthetic documents only.",
      r_rate_free:"Reason: the free model's limit is used up. Try again in a minute.", r_rate_local:"Reason: our own rate limit for the free model was hit. Wait a minute.",
      e_real_data_suspected:"The document seems to contain real personal data ({markers}). Demo mode accepts synthetic documents only; nothing was sent to the model.",
      e_real_data_after:"The photo transcription seems to contain real personal data ({markers}). The result was discarded. In demo mode upload synthetic documents only.",
      m_iin:"IIN/BIN", m_email:"e-mail", m_phone:"phone", m_iban:"IBAN", m_passport:"passport",
      fallback_note:"The main provider ({from}) is unavailable (limit or failure). Documents were read by the backup model {label} · {model}.",
      cached_note:"From cache: {n} doc(s) (the same text was already read, no limit used).", masked_note:"Hidden before sending to the model: {list}.",
      mk_person:"full name", mk_iin:"IIN/BIN", mk_email:"e-mail", mk_phone:"phone", mk_iban:"IBAN", mk_passport:"passport",
      ai_down:"AI unavailable: documents were read by the template-based demo parser.",
      r_auth:"Reason: the key was not accepted or there is no access to the model (401/403).", r_model:"Reason: wrong model identifier in META_MODEL (404).",
      r_rate:"Reason: request limit reached (429). Try again in a minute.", r_timeout:"Reason: the model did not answer in time.",
      r_network:"Reason: no connection to the model server.", r_server:"Reason: the model service failed (5xx).",
      r_bad_response:"Reason: the model's answer did not match the schema.", r_bad_request:"Reason: the service rejected the request (400). The model may not accept images.",
      e_client_timeout:"The answer did not arrive in time. Please try again.",
      json_fb:"JSON fallback mode", json_fb_note:"The model service did not accept the strict answer schema (json_schema). Documents were read in the \"return JSON\" fallback mode; quotes were verified by code in the same way.",
      disclaimer:"TradeDoc AI: reference and drafts, not customs advice. All example documents are synthetic and the companies are fictional. The server does not store documents; the shipment case is kept only in your browser.",
      reading_note:"MOCK mode reads text by a \"Label: value\" template and does not use AI. The PDF text layer is extracted by code, without AI. Photos and scans are read only by the selected provider's model (a free model or Meta). The comparison is always done by code.",
      sev_high:"high", sev_medium:"medium", demo:"demo", loading:"Checking…", err:"Could not check. Please try again.", page:"p.",
      sample_btn:"Sample: ",
      drop_text:"Drop PDF, photo or text files here.", drop_note:"Up to 1.5 MB per file. We detect the document type from its content. Files are not stored.",
      pick_files:"Choose files", pick_one:"File", own_file:"your file",
      reading:"Reading the file…", st_pdf:"From PDF: {name}, pages: {pages}. Text extracted by code, without AI.", st_text:"From file {name}.",
      st_photo:"From photo: {name}. Read by the model, confirm the values by hand.", st_dropped:"Fields dropped for lack of a quote: {n}.",
      st_edited:"Text edited by hand after upload.", st_placed:"{name}: detected as \"{doc}\".",
      unknown_type:"{name}: could not detect the document type. Upload it with the \"File\" button in the right column.",
      photo_tag:"read from a photo, confirm by hand", confirm_h:"Confirm by hand",
      e_file_too_large:"The file is larger than 1.5 MB. Compress it or upload it page by page.",
      e_unsupported_format:"This format is not supported. Use PDF, JPG, PNG, WEBP or TXT.",
      e_photo_needs_ai:"Reading photos needs an AI mode: a free model or Meta. Now in MOCK: upload a PDF with a text layer or a text file.",
      e_pdf_no_text:"The PDF has no text layer (looks like a scan). Upload the pages as photos: the model reads them in META mode.",
      e_pdf_unreadable:"The PDF cannot be read: it is damaged or password-protected.", e_pdf_timeout:"The PDF takes too long to read. Try a smaller file.",
      e_doc_too_long:"The document is longer than 20,000 characters.", e_empty_file:"The file is empty.",
      e_ai_unavailable:"The model could not read the image. Try again or upload a PDF.", e_other:"Could not read the file.",
      e_pdf_active_content:"The PDF has active content (scripts, attachments or forms) and is not accepted. Save the document again as a plain PDF.", e_pdf_too_many_pages:"The PDF has more than 20 pages. Upload only the pages you need.",
      e_too_many_requests:"Too many requests. Wait a minute and try again.", e_origin_not_allowed:"Request rejected: it did not come from the TradeDoc AI site.",
      case_h:"Shipment case", case_pick:"Choose a case", case_new:"New case", case_del:"Delete case", case_wipe:"Delete all my data",
      consent_text:"I accept the Terms of Use and the Privacy Policy and consent to data processing. In the free-model demo mode I upload synthetic documents only.",
      legal_docs:"Documents (drafts):", l_TERMS:"Terms", l_PRIVACY:"Privacy Policy", l_CONSENT:"Consent", l_DISCLAIMER:"Disclaimer",
      consent_needed:"To upload and check documents, tick the consent box above.",
      ai_mark_ai:"Prepared with AI: {label} · {model}. The comparison was done by code; check the findings against the originals.", ai_mark_mock:"Prepared automatically, without AI (template parsing). Check the findings against the originals.",
      disclaimer_short:"This is an aid: not a customs broker or a lawyer, it gives no legal advice and does not guarantee border clearance. AI results may contain errors. The user is responsible for the final documents.",
      case_name:"Trip (name, truck number)", case_dep:"Departure date", case_docs:"Document versions", case_hist:"Check history",
      case_note:"The case is stored only in this browser (localStorage): document texts, versions and check history. It is not sent to or stored on the server. \"Delete all\" erases every case on this device.",
      case_untitled:"Untitled trip", no_versions:"no versions", no_checks:"No checks yet.",
      due_in:"days to departure: {n}", due_today:"departure today", due_past:"departure date has passed",
      wipe_confirm:"Delete all my data from this browser: cases, document versions, check history, consent and settings? This cannot be undone.", del_confirm:"Delete this case from the browser?",
      st_err_quota:"Could not save: the browser storage is full. Delete old cases.",
      st_err_unavailable:"The browser does not allow saving data (for example, private mode). Checks work, but the case will not be saved.",
      st_err_partial:"Some saved cases were damaged and skipped; the rest are open.", st_err_too_large:"The case is too large to keep in the browser (over 2 MB). Delete old cases or versions.",
      st_err_corrupt:"Saved cases are damaged and could not be read. Start over or press \"Delete all\".",
      st_restored:"From the case: version v{v}{namePart}.",
      h_changed:"changed", h_fixed:"fixed", h_added:"new", h_still:"findings remaining", h_first:"first check in the case",
      diff_first:"{doc} v{v}: first saved version, nothing to compare with.", diff_head:"{doc}: v{a} → v{b}. Lines removed: {d}, added: {p}.", diff_same:"The text did not change.",
      fix_type:"Which document was corrected", fix_btn:"Upload the corrected document", print_btn:"Print / PDF",
      pr_title:"TradeDoc AI: document pack check report", pr_case:"Case", pr_dep:"Departure date", pr_at:"Checked", pr_mode:"Reading",
      pr_docs:"Documents", pr_result:"Result", pr_passed:"Checks passed: {p} of {t}. Skipped: {s}.", pr_changes:"Changes since the previous check",
      pr_findings:"Findings", pr_none:"No differences found among the checked items.", pr_confirm:"Confirm by hand",
      pr_novals:"The report shows what is written where. The party responsible for the document confirms the correct values: the system does not suggest them.",
      mode_mock:"template-based demo reading (MOCK), not AI", mode_ai:"model {label} · {model}, quotes verified by code", mode_free:"free tier, synthetic documents only",
      src_pdf:"from PDF", src_photo:"from photo, confirm by hand", src_text:"text", ql:"“", qr:"”",
    },
  };
  T.kk = {"eyebrow":"Орталық Азиядағы экспедиторлар мен шағын экспорттаушыларға","h1a":"Жүк құжаттарындағы сәйкессіздіктерді","h1b":"көлік шыққанға дейін табамыз.","lead":"Көлік шыққанға дейін құжаттар жиынтығын тексереміз. Сандар мен атауларды код салыстырады, әр ескертудің дәйексөзі мен беті бар. Қате серіктесте болса, дұрыс мәнді растауды сұрайтын хат дайындаймыз. Мәндерді ұсынбаймыз.","pack":"Құжаттар жиынтығы","d_invoice":"Инвойс","d_packing":"Қаптама парағы","synthetic":"синтетика","run":"Жиынтықты тексеру","drop_text":"PDF, фото немесе мәтін файлдарын осында сүйреңіз.","drop_note":"Әр файл 1,5 МБ-қа дейін. Құжат түрін мазмұны бойынша анықтаймыз. Файлдар сақталмайды.","pick_files":"Файлдарды таңдау","pick_one":"Файл","findings":"Ескертулер","all_checks":"Барлық тексерулер","passed_label":"Тексеру нәтижесі","st_found":"сәйкессіздік табылды","st_notfound":"сәйкессіздік табылмады","st_review":"адамның тексеруі қажет","st_nodata":"тексеруге дерек жоқ","consent_text":"Пайдалану шарттары мен құпиялылық саясатын қабылдаймын және деректерді өңдеуге келісім беремін. Тегін модельдің демо режимінде тек синтетикалық құжаттарды жүктеймін.","legal_docs":"Құжаттар (жобалар):","l_TERMS":"Шарттар","l_PRIVACY":"Құпиялылық саясаты","l_CONSENT":"Келісім","l_DISCLAIMER":"Жауапкершіліктен бас тарту","consent_needed":"Құжаттарды жүктеу және тексеру үшін жоғарыдағы келісімді белгілеңіз.","demo_label":"демо оқу (MOCK, ЖИ емес)","ai_label":"оқу: {label} · {model}","free_tag":"тегін тариф","meta_waiting":"Meta қабаты дайын, кілтті күтеміз. Қазіргі режим: {mode}.","demo_banner":"Демо режим: тегін модель {label}. Нақты құжаттарды жүктемеңіз: тегін тарифте провайдер деректерді өз өнімдерін жақсарту үшін пайдалануы мүмкін. Тек синтетикалық құжаттар.","ai_mark_ai":"ЖИ көмегімен дайындалды: {label} · {model}. Салыстыруды код жасады; ескертулерді түпнұсқамен тексеріңіз.","ai_mark_mock":"ЖИ-сіз автоматты түрде дайындалды (үлгі бойынша талдау). Ескертулерді түпнұсқамен тексеріңіз.","disclaimer":"TradeDoc AI: анықтама және жобалар, кедендік кеңес емес. Мысалдардағы құжаттар синтетикалық, компаниялар ойдан шығарылған. Сервер құжаттарды сақтамайды; жүк ісі тек сіздің браузеріңізде сақталады.","disclaimer_short":"Сервис көмекші құрал: кедендік брокер де, заңгер де емес, заң кеңесін бермейді және шекарадан өтуге кепілдік бермейді. ЖИ нәтижелерінде қате болуы мүмкін. Қорытынды құжаттар үшін пайдаланушы жауап береді.","case_wipe":"Менің барлық деректерімді жою","case_h":"Жүк ісі","case_new":"Жаңа іс","case_del":"Істі жою","err":"Тексеру мүмкін болмады. Қайталап көріңіз.","loading":"Тексерудемін…","reading":"Файлды оқудамын…","e_file_too_large":"Файл 1,5 МБ-тан үлкен. Оны сығыңыз немесе беттер бойынша жүктеңіз.","e_unsupported_format":"Бұл формат қолдау көрсетілмейді. PDF, JPG, PNG, WEBP және TXT жарайды.","e_photo_needs_ai":"Фотоны оқу үшін ЖИ режимі қажет: тегін модель немесе Meta. Қазір MOCK: мәтін қабаты бар PDF немесе мәтін жүктеңіз.","e_real_data_suspected":"Құжатта нақты дербес деректер бар сияқты ({markers}). Демо режимде тек синтетикалық құжаттар қабылданады, модельге ештеңе жіберілген жоқ.","e_pdf_active_content":"PDF белсенді мазмұнды (скрипттер, тіркемелер немесе формалар) қамтиды және қабылданбайды.","e_pdf_too_many_pages":"PDF-те 20-дан көп бет бар. Тек қажетті беттерді жүктеңіз.","e_too_many_requests":"Сұраулар тым көп. Бір минут күтіп, қайталаңыз.","e_other":"Файлды оқу мүмкін болмады.","r_rate_free":"Себебі: тегін модельдің лимиті таусылды. Бір минуттан кейін қайталаңыз.","kk_note":"Қазақша аударма ішінара және ана тілінде сөйлейтін адамның тексеруін қажет етеді."};
  const NEW_I18N = {"ru":{"tab_documents":"Документы","tab_check":"Проверка","tab_case":"Дело груза","tab_report":"Отчёт","consent_short":"Принимаю условия и даю согласие на обработку данных. В демо-режиме бесплатной модели загружаю только синтетические документы.","empty_docs_h":"Документов пока нет","empty_docs_p":"Загрузите PDF, фото или текстовые файлы комплекта (инвойс, упаковочный лист, CMR) либо возьмите демо-комплект из синтетических документов.","load_pack":"Загрузить комплект","demo_pack":"Взять демо-комплект","clear_one":"Очистить","raw_show":"Показать/редактировать исходный текст","raw_hide":"Скрыть исходный текст","raw_label":"Исходный текст документа","uploaded_tag":"загружено","restored_tag":"из дела","kb":"КБ","bytes":"Б","sheet_empty":"Пусто. Загрузите файл или вставьте текст.","sheet_other":"Прочие строки (как в документе)","th_n":"№","th_desc":"Товар","th_qty":"Кол-во","th_unit":"Ед.","th_price":"Цена","th_sum":"Сумма","total_row":"Итого","p_seller":"Продавец / отправитель","p_buyer":"Покупатель / получатель","fn_number":"Номер","fn_reference":"Ссылка на инвойс","fn_date":"Дата","fn_shipment_date":"Дата отгрузки","fn_currency":"Валюта","fn_hs_code":"Код ТН ВЭД","fn_incoterms":"Инкотермс","fn_total":"Итого","fn_gross_weight":"Вес брутто","fn_net_weight":"Вес нетто","fn_packages":"Мест","empty_check_h":"Проверки ещё не было","empty_check_p":"Загрузите документы на вкладке «Документы» и нажмите «Проверить комплект».","go_docs":"Перейти к документам","empty_report_h":"Отчёта пока нет","g_found":"Найдено","g_review":"Нужна проверка человеком","g_ok":"Не найдено","none_review":"Нет пунктов, требующих ручной проверки.","none_ok":"Пока ничего.","date_hint":"Выберите в календаре или введите вручную (формат как в вашем браузере)","report_note":"Печатная версия: замечания с цитатами, без «правильных» значений. Откроется диалог печати браузера, оттуда можно сохранить PDF.","meta_mode":"Режим","meta_time":"Проверено","meta_checks":"Проверок","meta_pack":"Хэш комплекта (SHA-256)","meta_rules":"Каталог правил","meta_app":"Версия","meta_checks_v":"{n} выполнено, {s} пропущено","pr_pack":"Комплект (SHA-256)","jump_hint":"Показать в документе"},"en":{"tab_documents":"Documents","tab_check":"Check","tab_case":"Shipment case","tab_report":"Report","consent_short":"I accept the terms and consent to data processing. In the free-model demo mode I upload synthetic documents only.","empty_docs_h":"No documents yet","empty_docs_p":"Upload PDF, photo or text files of the pack (invoice, packing list, CMR) or take the demo pack of synthetic documents.","load_pack":"Upload a pack","demo_pack":"Use the demo pack","clear_one":"Clear","raw_show":"Show / edit source text","raw_hide":"Hide source text","raw_label":"Source text of the document","uploaded_tag":"uploaded","restored_tag":"from case","kb":"KB","bytes":"B","sheet_empty":"Empty. Upload a file or paste text.","sheet_other":"Other lines (as in the document)","th_n":"No","th_desc":"Goods","th_qty":"Qty","th_unit":"Unit","th_price":"Price","th_sum":"Amount","total_row":"Total","p_seller":"Seller / sender","p_buyer":"Buyer / consignee","fn_number":"Number","fn_reference":"Invoice reference","fn_date":"Date","fn_shipment_date":"Shipment date","fn_currency":"Currency","fn_hs_code":"HS code","fn_incoterms":"Incoterms","fn_total":"Total","fn_gross_weight":"Gross weight","fn_net_weight":"Net weight","fn_packages":"Packages","empty_check_h":"No check yet","empty_check_p":"Upload documents on the \"Documents\" tab and press \"Check the pack\".","go_docs":"Go to documents","empty_report_h":"No report yet","g_found":"Found","g_review":"Needs a human check","g_ok":"Not found","none_review":"Nothing needs a manual check.","none_ok":"Nothing yet.","date_hint":"Pick in the calendar or type it (format as in your browser)","report_note":"Printable version: findings with quotes, without \"correct\" values. The browser print dialog opens; you can save a PDF there.","meta_mode":"Mode","meta_time":"Checked","meta_checks":"Checks","meta_pack":"Pack hash (SHA-256)","meta_rules":"Rules catalog","meta_app":"Version","meta_checks_v":"{n} done, {s} skipped","pr_pack":"Pack (SHA-256)","jump_hint":"Show in the document"},"kk":{"tab_documents":"Құжаттар","tab_check":"Тексеру","tab_case":"Жүк ісі","tab_report":"Есеп","consent_short":"Шарттармен келісемін және деректерді өңдеуге келісім беремін. Тегін модельдің демо режимінде тек синтетикалық құжаттарды жүктеймін.","empty_docs_h":"Құжаттар әзірге жоқ","empty_docs_p":"Жиынтықтың PDF, фото немесе мәтін файлдарын жүктеңіз немесе синтетикалық демо жиынтықты алыңыз.","load_pack":"Жиынтықты жүктеу","demo_pack":"Демо жиынтықты алу","clear_one":"Тазалау","raw_show":"Бастапқы мәтінді көрсету/өңдеу","raw_hide":"Бастапқы мәтінді жасыру","uploaded_tag":"жүктелген","g_found":"Табылды","g_review":"Адамның тексеруі қажет","g_ok":"Табылмады","go_docs":"Құжаттарға өту","empty_check_h":"Тексеру әлі болған жоқ","empty_report_h":"Есеп әлі жоқ"}};
  for (const k of Object.keys(NEW_I18N)) Object.assign(T[k], NEW_I18N[k]);
  // состояние результата и черновика (аудит 05.11.2026); казахский берёт недостающее из русского
  const STATE_I18N = {
    ru: { stale_note: "Документы изменились после проверки: результат устарел. Печать и письмо недоступны до новой проверки.",
      discarded_note: "Ответ проверки пришёл после смены дела или документов и не применён. Запустите проверку заново.",
      not_saved: "Результат не сохранён в деле.", lost: "Больше не удалось проверить", h_lost: "больше не удалось проверить",
      consent_stopped: "Согласие отозвано: загрузка остальных файлов остановлена.",
      case_limit: "Достигнут лимит дел в браузере (20). Удалите ненужное дело на вкладке «Дело груза»: старые дела сами не удаляются.",
      page_replaced: "{name} заменил ранее загруженный «{doc}»: страницы одного документа не объединяются. Загрузите многостраничный документ одним PDF.", draft_restored: "Восстановлен несохранённый черновик документов этого дела." },
    en: { stale_note: "The documents changed after the check: the result is out of date. Print and letter are unavailable until a new check.",
      discarded_note: "The check answer arrived after the case or documents changed and was not applied. Run the check again.",
      not_saved: "The result was not saved to the case.", lost: "Could no longer be checked", h_lost: "could no longer be checked",
      consent_stopped: "Consent withdrawn: uploading the remaining files was stopped.",
      case_limit: "The browser case limit (20) is reached. Delete a case you no longer need on the Shipment case tab: old cases are not deleted automatically.",
      page_replaced: "{name} replaced the earlier \"{doc}\": pages of one document are not merged. Upload a multi-page document as one PDF.", draft_restored: "An unsaved draft of this case's documents was restored." },
  };
  for (const k of Object.keys(STATE_I18N)) Object.assign(T[k], STATE_I18N[k]);
  const DOCN = { kk: { invoice: "Инвойс", packing: "Қаптама парағы", cmr: "CMR" }, ru: { invoice: "Инвойс", packing: "Упаковочный лист", cmr: "CMR" }, en: { invoice: "Invoice", packing: "Packing list", cmr: "CMR" } };
  const $ = (s) => document.querySelector(s);
  const ids = ["invoice", "packing", "cmr"];
  let lang = "ru", samples = [], last = null, prevIds = null, jsonFb = false, maxBytes = 1536000;
  let modeInfo = { provider: "mock", label: "MOCK", model: null, demoOnly: false, meta: "waiting_key" }; // из /api/config
  const sources = {};
  try { lang = localStorage.getItem("td:lang") || "ru"; } catch {}
  if (!T[lang]) lang = "ru";

  // казахский переведён не полностью: недостающие строки берутся из русского, а не показываются ключом
  const t = (k) => T[lang][k] ?? T.ru[k] ?? k;
  // то же правило для текстов результата с сервера ({ ru, en }): на казахском показывается русский, а не пусто
  const L = (o) => (o ? o[lang] ?? o.ru ?? o.en ?? "" : "");
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  // gen растёт при любом изменении документов или дела; ответ проверки применяется, только если gen тот же
  let gen = 0, running = null, stale = false, lastEntry = null, lastCaseId = null;

  function applyLang() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-t]").forEach((n) => { n.textContent = t(n.dataset.t); });
    applyBtn();
    document.querySelectorAll("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
    $("#letterLang").value = lang === "en" ? "en" : "ru"; // писем на казахском пока нет
    $("#kkNote").hidden = lang !== "kk"; $("#kkNote").textContent = lang === "kk" ? t("kk_note") : "";
    renderModeInfo();
    renderSamples();
    ids.forEach(renderSource);
    const fx = $("#fixType").options; fx[0].textContent = DOCN[lang].invoice; fx[1].textContent = DOCN[lang].packing;
    ids.forEach((id) => setRaw(id, !$("#raw-" + id).hidden));
    renderCase(); showStoreErr();
    if (typeof renderLegalLinks === "function") { renderLegalLinks(); applyConsent(); }
    if (last) renderResult(last, true);
  }

  function renderSamples() {
    const box = $("#samples"); box.textContent = "";
    for (const s of samples) {
      const b = el("button", "btn secondary sm", t("sample_btn") + L(s.label));
      b.type = "button";
      b.addEventListener("click", () => useSample(s));
      box.append(b);
    }
  }
  function useSample(s) { fill(s); clearResult(); }
  // результат есть или нет: вкладки «Проверка» и «Отчёт» показывают либо результат, либо пустое состояние
  function setResultVisible(v) {
    $("#out").hidden = !v; $("#checkEmpty").hidden = v;
    $("#reportBody").hidden = !v; $("#reportEmpty").hidden = v;
  }

  // ---- жизненный цикл результата ----
  // Результат привязан к документам, на которых считался. Любая правка, очистка или загрузка документа
  // делает его устаревшим: печать и письмо блокируются до новой проверки, подготовленный отчёт стирается.
  function docsChanged() {
    gen++;
    if (last && !stale) { stale = true; updateExports(); }
    saveDraftSoon();
  }
  function note(cls, text) { for (const box of [$("#out"), $("#reportBody")]) box.prepend(el("p", "warn " + cls, text)); }
  function updateExports() {
    $("#printBtn").disabled = !last || stale;
    $("#mkLetter").disabled = !last || stale;
    document.querySelectorAll("#out > .stale-note, #reportBody > .stale-note").forEach((n) => n.remove());
    if (last && stale) {
      note("stale-note", t("stale_note"));
      $("#letter").textContent = ""; $("#letter").hidden = true; $("#copyLetter").hidden = true;
      $("#printReport").textContent = "";
    }
  }
  /** Убрать результат целиком: и с экрана, и из DOM (замечания, письмо, печатный отчёт). */
  function clearResult() {
    last = null; prevIds = null; stale = false; lastEntry = null; lastCaseId = null;
    for (const s of ["#findings", "#reviewList", "#passedList", "#checks", "#inspector", "#diff", "#runMeta", "#reportMeta", "#printReport", "#letter", "#aiMark"]) $(s).textContent = "";
    document.querySelectorAll(".stale-note, .save-warn").forEach((n) => n.remove());
    $("#letter").hidden = true; $("#copyLetter").hidden = true;
    setResultVisible(false); updateExports();
  }

  // ---- черновик: введённые и загруженные тексты не теряются при перезагрузке (только этот браузер) ----
  const DRAFT_KEY = "td:draft:v1";
  let draftTimer = null;
  function saveDraftSoon() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      try { storage?.setItem(DRAFT_KEY, JSON.stringify({ caseId: st.current, docs: Object.fromEntries(ids.map((id) => [id, $("#t-" + id).value])) })); } catch {}
    }, 300);
  }
  function restoreDraft() {
    let d = null;
    try { d = JSON.parse(storage?.getItem(DRAFT_KEY) ?? "null"); } catch {}
    if (!d || typeof d !== "object" || d.caseId !== st.current || typeof d.docs !== "object" || !d.docs) return false;
    const texts = ids.map((id) => (typeof d.docs[id] === "string" ? d.docs[id].slice(0, 40000) : ""));
    if (texts.every((x, i) => x === $("#t-" + ids[i]).value)) return false;
    ids.forEach((id, i) => { if (texts[i] !== $("#t-" + id).value) { $("#t-" + id).value = texts[i]; delete sources[id]; } renderSource(id); });
    $("#dropStatus").append(el("div", "warn", t("draft_restored")));
    return true;
  }
  function fill(s) {
    for (const id of ids) { delete sources[id]; $("#t-" + id).value = ""; }
    for (const d of s.docs) $("#t-" + d.type).value = d.text;
    $("#dropStatus").textContent = ""; ids.forEach(renderSource);
    docsChanged();
  }
  // Что прочитано из загруженного файла. Только в памяти страницы: на сервере ничего не хранится.
  // Если текст поправили руками, он больше не «из PDF/фото», и разбор фото не отправляется.
  function getDocs() {
    return ids.map((id) => {
      const d = { type: id, text: $("#t-" + id).value }, s = sources[id];
      if (s && s.text === d.text) { d.origin = s.origin; if (s.extraction) d.extraction = s.extraction; if (s.sha256) d.fileSha256 = s.sha256; }
      return d;
    }).filter((d) => d.text.trim());
  }

  const fmtSize = (b) => (b < 1024 ? `${b} ${t("bytes")}` : `${(b / 1024).toLocaleString(lang === "en" ? "en-GB" : lang === "kk" ? "kk-KZ" : "ru-RU", { maximumFractionDigits: 1 })} ${t("kb")}`);
  const fmt = (k, vars) => t(k).replace(/\{(\w+)\}/g, (_, v) => String(vars[v] ?? ""));
  function renderSource(id) {
    const s = sources[id], st = $("#s-" + id), badge = document.querySelector(`[data-src="${id}"]`);
    const v = $("#t-" + id).value, sizeEl = document.querySelector(`[data-size="${id}"]`);
    renderSheet(id);
    $("#docsEmpty").hidden = ids.some((x) => $("#t-" + x).value.trim());
    badge.textContent = s ? (s.kind === "restored" ? t("restored_tag") : t("uploaded_tag")) : t("synthetic");
    badge.title = s ? t("own_file") : "";
    sizeEl.textContent = v.trim() ? (s?.name ? s.name + " · " : "") + fmtSize(s && s.text === v && s.size ? s.size : new TextEncoder().encode(v).length) : "";
    st.className = "status"; st.textContent = "";
    if (!s) return;
    if (s.error) { st.classList.add("bad"); st.textContent = errText(s.error, s.reason, s.markers, s.after); return; }
    if (s.text !== $("#t-" + id).value) { st.textContent = t("st_edited"); return; }
    st.textContent = s.kind === "restored" ? fmt("st_restored", { v: s.v, namePart: s.name ? " · " + s.name : "" }) + (s.origin === "photo" ? " " + t("photo_tag") : "")
      : fmt(s.kind === "pdf" ? "st_pdf" : s.kind === "photo" ? "st_photo" : "st_text", s) + (s.dropped ? " " + fmt("st_dropped", { n: s.dropped }) : "");
    if (s.origin === "photo") st.classList.add("photo");
  }

  // сервер ждёт модель не дольше двух попыток по META_TIMEOUT_MS (25 с); браузер ждёт сервер с запасом
  const READ_TIMEOUT_MS = 90000, CHECK_TIMEOUT_MS = 120000;
  const errText = (code, reason, markers, after) => {
    if (code === "real_data_suspected") return fmt(after ? "e_real_data_after" : "e_real_data_suspected", { markers: markerList(markers) });
    const k = reason === "rate" && modeInfo.demoOnly ? "rate_free" : reason;
    return (T[lang]["e_" + code] ?? t("e_other")) + (k && T[lang]["r_" + k] ? " " + t("r_" + k) : "");
  };
  // честная метка режима: MOCK (не ИИ), бесплатная модель с названием или Meta; p из /api/config или результата проверки
  const isAi = (p) => p && (p.name ?? p.provider) && (p.name ?? p.provider) !== "mock";
  const modeLabel = (p, fb) => (isAi(p)
    ? fmt("ai_label", { label: p.label, model: p.model }) + (p.demoOnly ? " · " + t("free_tag") : "") + (fb ? " · " + t("json_fb") : "")
    : t("demo_label"));
  function renderModeInfo() {
    const p = last?.provider ?? modeInfo;
    $("#modeBadge").textContent = modeLabel(p, last ? last.jsonFallback : jsonFb);
    $("#modeBadge").className = "badge " + (isAi(p) ? (p.demoOnly ? "free" : "ai") : "mock");
    const banner = $("#demoBanner");
    banner.hidden = !(isAi(p) && p.demoOnly);
    banner.textContent = banner.hidden ? "" : fmt("demo_banner", { label: p.label });
    $("#metaNote").textContent = modeInfo.meta === "active" ? "" : fmt("meta_waiting", { mode: modeLabel(modeInfo) });
  }
  const markerList = (ms) => (ms ?? []).map((m) => T[lang]["m_" + m] ?? m).join(", ");

  async function upload(file, type) {
    const say = (text, bad) => { const p = el("div", null, text); if (bad) p.className = "bad"; $("#dropStatus").append(p); };
    const fail = (code, reason, markers, after) => {
      if (type) { sources[type] = { name: file.name, error: code, reason, markers, after }; renderSource(type); }
      else say(`${file.name}: ${errText(code, reason, markers, after)}`, true);
    };
    if (!$("#consent").checked) return false; // без действующего согласия файл не отправляется
    if (file.size > maxBytes) return fail("file_too_large");
    const st = type ? $("#s-" + type) : $("#dropStatus");
    if (type) { st.className = "status"; st.textContent = t("reading"); }
    let r;
    try {
      // фото читает модель: сервер ждёт её не дольше двух попыток, браузер ждёт сервер не дольше READ_TIMEOUT_MS
      const res = await fetch("/api/read" + (type ? "?type=" + type : ""), { method: "POST", headers: { "content-type": "application/octet-stream" }, body: file, signal: AbortSignal.timeout(READ_TIMEOUT_MS) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return fail(body.code || (res.status === 413 ? "file_too_large" : "other"), body.reason, body.markers, body.afterSend);
      r = body;
    } catch (e) { return fail(e?.name === "TimeoutError" ? "client_timeout" : "other"); }
    const target = type || r.type;
    if (!target) return say(fmt("unknown_type", { name: file.name }), true);
    if (sources[target]?.origin && !sources[target].error) say(fmt("page_replaced", { name: file.name, doc: DOCN[lang][target] }), true);
    $("#t-" + target).value = r.text;
    sources[target] = { name: file.name, size: file.size, kind: r.kind, origin: r.origin, pages: r.pages, text: r.text, extraction: r.extraction, dropped: r.dropped?.length || 0, sha256: r.sha256 };
    renderSource(target); docsChanged();
    if (!type) say(fmt("st_placed", { name: file.name, doc: DOCN[lang][target] }));
  }
  async function uploadMany(files, type) {
    if (!type) $("#dropStatus").textContent = "";
    // по одному файлу на запрос (лимит тела запроса на хостингах); согласие проверяется перед каждым файлом
    for (const f of files) {
      if (!$("#consent").checked) { $("#dropStatus").append(el("div", "bad", t("consent_stopped"))); break; }
      await upload(f, type);
    }
  }

  const norm = (x) => String(x ?? "").replace(/\s+/g, " ").trim();
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  // вкладки: «Документы», «Проверка», «Дело груза», «Отчёт»; состояние в адресной строке (#documents), работает «назад»
  const TABS = ["documents", "check", "case", "report"];
  function applyTab(name) {
    if (!TABS.includes(name)) name = "documents";
    for (const n of TABS) {
      const on = n === name, b = $("#tabbtn-" + n);
      b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; $("#tab-" + n).hidden = !on;
    }
    return name;
  }
  function showTab(name, { top = true } = {}) {
    name = applyTab(name);
    if (location.hash !== "#" + name) location.hash = name;
    if (top) window.scrollTo({ top: 0, behavior: "auto" });
  }
  window.addEventListener("hashchange", () => applyTab(location.hash.slice(1)));

  function setRaw(id, open) {
    $("#raw-" + id).hidden = !open;
    const b = document.querySelector(`[data-toggle="${id}"]`);
    b.setAttribute("aria-expanded", String(open)); b.textContent = t(open ? "raw_hide" : "raw_show");
  }

  // Лист документа: разбор существующим кодом (lib/extract/mock.js, не ИИ). Значения как написаны;
  // что не узнали, показано строкой как есть. Всё через textContent и узлы DOM, значения никогда не вставляются как HTML.
  function renderSheet(id) {
    const box = $("#sheet-" + id); box.textContent = "";
    const text = $("#t-" + id).value;
    if (!text.trim()) { box.append(el("p", "paper-empty", t("sheet_empty"))); return; }
    const ex = mockExtract({ type: id, text }), F = ex.fields, used = new Set();
    const tag = (node, f) => { if (f?.quote) { node.dataset.q = norm(f.quote); used.add(norm(f.quote)); } return node; };

    const title = el("div", "p-title");
    title.append(el("b", null, DOCN[lang][id]));
    const num = F.number ?? F.reference;
    if (num) title.append(tag(el("span", "p-row", "№ " + num.value), num));
    for (const k of ["date", "shipment_date"]) if (F[k]) title.append(tag(el("span", "p-row", `${t("fn_" + k)}: ${F[k].value}`), F[k]));
    box.append(title);

    const parties = el("div", "p-parties");
    for (const [k, lbl] of [["seller", "p_seller"], ["buyer", "p_buyer"]]) if (F[k]) {
      const d = tag(el("div", "p-row"), F[k]);
      d.append(el("span", "p-label", t(lbl)), document.createTextNode(F[k].value));
      parties.append(d);
    }
    if (parties.children.length) box.append(parties);

    if (ex.items.length) {
      for (const it of ex.items) used.add(norm(it.quote));
      const cols = [["n", "th_n", false], ["desc", "th_desc", false], ["qty", "th_qty", true], ["unit", "th_unit", false], ["price", "th_price", true], ["total", "th_sum", true]]
        .filter(([k]) => k === "n" || k === "desc" || ex.items.some((it) => it[k]));
      const table = el("table", "items"), thead = el("thead"), head = el("tr");
      for (const [, label, isNum] of cols) head.append(el("th", isNum ? "num" : null, t(label)));
      thead.append(head); table.append(thead);
      const body = el("tbody");
      for (const it of ex.items) {
        const tr = el("tr"); tr.dataset.q = norm(it.quote);
        for (const [k, , isNum] of cols) tr.append(el("td", isNum ? "num" : null, it[k] != null ? String(it[k]) : ""));
        body.append(tr);
      }
      table.append(body);
      if (F.total && cols.some(([k]) => k === "total")) {
        const tf = el("tfoot"), tr = tag(el("tr"), F.total), first = el("td", null, t("total_row"));
        first.colSpan = cols.length - 1;
        tr.append(first, el("td", "num", F.total.value)); tf.append(tr); table.append(tf);
      }
      const wrap = el("div", "table-wrap"); wrap.append(table); box.append(wrap);
    }

    const facts = el("dl", "p-facts");
    for (const k of ["reference", "currency", "hs_code", "incoterms", "total", "gross_weight", "net_weight", "packages"]) {
      const f = F[k]; if (!f || used.has(norm(f.quote)) || (k === "reference" && F.number)) continue;
      facts.append(tag(el("dt", null, t("fn_" + k)), f), tag(el("dd", null, f.value), f));
    }
    if (facts.children.length) box.append(facts);

    const other = text.split("\n").map((l) => l.trim()).filter((l) => l && !/^-{3,}\s*page.*-{3,}$/i.test(l) && !used.has(norm(l)));
    if (other.length) {
      const d = el("details", "p-other"); d.open = true;
      d.append(el("summary", null, t("sheet_other")));
      for (const l of other) { const p = el("p", null, l); p.dataset.q = norm(l); d.append(p); }
      box.append(d);
    }
  }

  function sheetMatches(doc, quote) {
    const q = norm(quote); if (!q) return [];
    const all = [...document.querySelectorAll(`#sheet-${doc} [data-q]`)];
    const exact = all.filter((n) => n.dataset.q === q);
    return exact.length ? exact : q.length >= 6 ? all.filter((n) => n.dataset.q.includes(q)) : [];
  }
  function clearHighlight() { document.querySelectorAll(".hl").forEach((n) => n.classList.remove("hl")); }

  // клик по замечанию: открыть «Документы», прокрутить к листу и подсветить цитату;
  // если на листе её нет, показать исходный текст и выделить цитату в нём
  function goToQuote(doc, quote) {
    showTab("documents", { top: false });
    clearHighlight();
    const hits = sheetMatches(doc, quote);
    if (hits.length) {
      hits.forEach((n) => n.classList.add("hl"));
      hits[0].tabIndex = -1;
      hits[0].scrollIntoView({ block: "center", behavior: reduce() ? "auto" : "smooth" });
      hits[0].focus({ preventScroll: true });
    } else {
      setRaw(doc, true);
      const ta = $("#t-" + doc), i = ta.value.indexOf(quote);
      ta.focus();
      if (i >= 0) ta.setSelectionRange(i, i + quote.length);
      ta.scrollIntoView({ block: "center", behavior: reduce() ? "auto" : "smooth" });
    }
  }

  function evButton(e) {
    const b = el("button", "ev"); b.type = "button"; b.title = t("jump_hint");
    b.append(el("span", null, `${DOCN[lang][e.doc] ?? e.doc} · ${t("page")} ${e.page}`), el("code", null, e.quote));
    if (e.origin === "photo") b.append(el("span", "ph", t("photo_tag")));
    b.addEventListener("click", () => goToQuote(e.doc, e.quote));
    return b;
  }

  function findingCard(f) {
    const card = el("article", "f");
    const head = el("div", "row u-between");
    head.append(el("h3", null, L(f.title)), el("span", "badge " + f.severity, t("sev_" + f.severity)));
    card.append(head);
    const detail = L(f.details) || f.detail;
    if (detail) card.append(el("p", "d", detail));
    const grid = el("div", "ev-grid");
    for (const e of f.evidence) grid.append(evButton(e));
    card.append(grid);
    return card;
  }

  // журнал проверки: режим, время, число проверок, версия, каталог правил, хэш комплекта
  function renderRunMeta(box, r) {
    box.textContent = "";
    const add = (k, v, cls) => box.append(el("dt", null, t(k)), el("dd", cls, v));
    add("meta_mode", modeLabel(r.provider, r.jsonFallback));
    add("meta_time", r.run?.at ? new Date(r.run.at).toLocaleString(locale()) : "—");
    add("meta_checks", fmt("meta_checks_v", { n: r.total, s: r.skipped }));
    add("meta_app", r.run?.app ?? "—");
    add("meta_rules", r.run ? `${r.run.rules.source} · ${r.run.rules.version}` : "—");
    add("meta_pack", r.run?.packSha256 ?? "—", "mono");
  }

  function renderResult(r, keepDiff) {
    setResultVisible(true);
    last = r; renderModeInfo();
    // три статуса вместо «всё хорошо»: найдено / не найдено / нужна проверка человеком
    const sm = r.summary ?? { found: r.findings.length, notFound: r.passed, needsReview: 0, noData: r.skipped };
    $("#statFound").textContent = sm.found; $("#statReview").textContent = sm.needsReview; $("#statOk").textContent = sm.notFound;
    $("#scoreLegend").textContent = `${sm.found} ${t("st_found")} · ${sm.notFound} ${t("st_notfound")} · ${sm.needsReview} ${t("st_review")} · ${sm.noData} ${t("st_nodata")}`;
    renderRunMeta($("#runMeta"), r); renderRunMeta($("#reportMeta"), r);

    const diff = $("#diff"); diff.textContent = "";
    if (r.aiUnavailable) {
      // для бесплатной модели лимит объясняем отдельно: «лимит бесплатной модели исчерпан»
      const k = r.aiError === "rate" && modeInfo.demoOnly ? "rate_free" : r.aiError;
      diff.append(el("p", "warn", t("ai_down") + (k && T[lang]["r_" + k] ? " " + t("r_" + k) : "")));
    }
    if (r.provider?.fallbackFrom) diff.append(el("p", "warn", fmt("fallback_note", { from: r.provider.fallbackFrom, label: r.provider.label, model: r.provider.model })));
    if (r.cachedDocs) diff.append(el("p", "note", fmt("cached_note", { n: r.cachedDocs })));
    const maskedKinds = Object.keys(r.masked ?? {});
    if (maskedKinds.length) diff.append(el("p", "note", fmt("masked_note", { list: maskedKinds.map((k) => `${t("mk_" + k)} × ${r.masked[k]}`).join(", ") })));
    if (r.jsonFallback) diff.append(el("p", "warn", t("json_fb_note")));
    if (prevIds && !keepDiff) {
      const now = new Set(r.findings.map((f) => f.id));
      // «исправлено» только при явном pass той же проверки; пропуск (данных больше нет) это «больше не удалось проверить»
      const passedNow = new Set(r.checks.filter((c) => c.status === "pass").map((c) => c.id));
      const gone = [...prevIds].filter((x) => !now.has(x));
      const fixed = gone.filter((x) => passedNow.has(x)), lost = gone.filter((x) => !passedNow.has(x));
      const added = [...now].filter((x) => !prevIds.has(x)), still = [...now].filter((x) => prevIds.has(x));
      const name = (id) => L(r.checks.find((c) => c.id === id)?.title) || id;
      fixed.forEach((id) => diff.append(el("span", "badge ok", `${t("fixed")}: ${name(id)}`)));
      lost.forEach((id) => diff.append(el("span", "badge medium", `${t("lost")}: ${name(id)}`)));
      added.forEach((id) => diff.append(el("span", "badge high", `${t("added")}: ${name(id)}`)));
      if (still.length) diff.append(el("span", "badge medium", `${t("still")}: ${still.length}`));
    }
    if (!keepDiff) prevIds = new Set(r.findings.map((f) => f.id));
    // пометка на всех результатах: с помощью ИИ (какая модель) или автоматически без ИИ
    $("#aiMark").textContent = isAi(r.provider) ? fmt("ai_mark_ai", { label: r.provider.label, model: r.provider.model }) : t("ai_mark_mock");

    const fbox = $("#findings"); fbox.textContent = "";
    if (!r.findings.length) fbox.append(el("p", "badge ok", t("no_findings")));
    r.findings.forEach((f) => fbox.append(findingCard(f)));
    $("#cntFound").textContent = `(${r.findings.length})`;
    // проверки, пропущенные с причиной (неоднозначное число, неподтверждённое чтение): где написано, без «правильного» значения
    const unsure = r.checks.filter((c) => c.status === "skip" && c.reasonText);
    const rbox = $("#reviewList"); rbox.textContent = "";
    for (const c of unsure) {
      const card = el("article", "f");
      card.append(el("h3", null, L(c.title)), el("p", "d", L(c.reasonText)));
      const grid = el("div", "ev-grid");
      for (const e of c.evidence) grid.append(evButton(e));
      if (grid.children.length) card.append(grid);
      rbox.append(card);
    }
    if (!unsure.length) rbox.append(el("p", "note", t("none_review")));
    $("#cntReview").textContent = `(${unsure.length})`;
    const passed = r.checks.filter((c) => c.status === "pass");
    const pbox = $("#passedList"); pbox.textContent = "";
    for (const c of passed) { const li = el("li"); li.append(el("span", "ok", "✓"), el("span", null, L(c.title))); pbox.append(li); }
    if (!passed.length) pbox.append(el("li", null, t("none_ok")));
    $("#cntOk").textContent = `(${passed.length})`;

    const ibox = $("#inspector"); ibox.textContent = "";
    if (!r.inspector.questions.length) ibox.append(el("p", "note", t("insp_none")));
    for (const q of r.inspector.questions) {
      const d = el("div", "q"); d.append(el("p", null, L(q.q)));
      const meta = el("small", null, `${q.rule} · ${t("demo")} · ${q.status}`); d.append(meta); ibox.append(d);
    }
    $("#inspNote").textContent = t("insp_note") + (r.inspector.noRule.length ? " " + t("no_rule") + r.inspector.noRule.join(", ") : "");

    const cl = $("#checks"); cl.textContent = "";
    for (const c of r.checks) {
      const li = el("li", c.status); li.append(el("i", null, c.status === "pass" ? "✓" : c.status === "fail" ? "!" : c.reasonText ? "?" : "–"), el("span", null, L(c.title) + (c.reasonText ? ` (${L(c.reasonText)})` : "")));
      cl.append(li);
    }
    $("#letter").hidden = true; $("#copyLetter").hidden = true;
    // «исправленный документ»: по умолчанию тот, на который чаще всего ссылаются замечания
    const cited = {}; for (const f of r.findings) for (const e of f.evidence) cited[e.doc] = (cited[e.doc] ?? 0) + 1;
    const top = Object.entries(cited).sort((a, b) => b[1] - a[1])[0];
    if (top && !keepDiff) $("#fixType").value = top[0];
    last = r;
    updateExports();
  }

  async function run() {
    if (running) return; // одна проверка за раз: смена языка и другие кнопки второй запуск не открывают
    const docs = getDocs(); if (!docs.length || !$("#consent").checked) return;
    // снимок на старте: дело, ревизия документов и сами документы. Ответ применяется только к ним.
    const job = { gen, caseId: st.current };
    running = job; updateRunBtn();
    setResultVisible(true);
    const fbox = $("#findings"); fbox.textContent = ""; for (let i = 0; i < 3; i++) fbox.append(el("span", "sk"));
    let r, err = null;
    try {
      const res = await fetch("/api/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ docs }), signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw Object.assign(new Error(String(res.status)), { code: b.code, markers: b.markers }); }
      r = await res.json();
    } catch (e) { err = e; }
    running = null; updateRunBtn();
    const c0 = CS.currentCase(st);
    if (gen !== job.gen || st.current !== job.caseId || (job.caseId && !c0)) {
      // пока ждали ответ, сменили дело, удалили данные или поправили документы: старый ответ не применяется
      fbox.textContent = "";
      const msg = t("discarded_note");
      fbox.append(el("p", "warn stale-note", msg)); $("#dropStatus").append(el("div", "warn stale-note", msg));
      if (last) renderResult(last, true); else setResultVisible(false);
      return;
    }
    if (err) {
      fbox.textContent = "";
      fbox.append(el("p", "warn", err?.name === "TimeoutError" ? t("e_client_timeout") : err?.code ? errText(err.code, null, err.markers) : t("err")));
      showTab("check"); return;
    }
    // дело груза: сравнение с прошлой проверкой этого дела, новая версия документа только если текст изменился
    const c = c0 ?? CS.newCase(st, { title: $("#caseName").value, departure: $("#caseDep").value });
    if (!c) {
      stale = false; prevIds = null; lastEntry = null; lastCaseId = null;
      renderResult(r, false); showTab("check");
      document.querySelectorAll(".save-warn").forEach((n) => n.remove());
      note("save-warn", `${t("not_saved")} ${t("case_limit")}`);
      return;
    }
    const lc = c.checks.at(-1);
    prevIds = lc ? new Set(lc.findings.map((f) => f.id)) : null;
    stale = false;
    const vs = CS.addVersions(c, docs.map((d) => ({ ...d, name: d.origin ? sources[d.type]?.name ?? "" : "", kind: d.origin ? sources[d.type]?.kind ?? "" : "" })));
    lastEntry = CS.recordCheck(c, { ...vs, result: r }); lastCaseId = c.id;
    renderResult(r, false);
    showTab("check");
    persist(); renderCase();
    // ошибка сохранения видна рядом с результатом, а не только во вкладке «Дело груза»
    document.querySelectorAll(".save-warn").forEach((n) => n.remove());
    if (storeErr) note("save-warn", `${t("not_saved")} ${t("st_err_" + storeErr)}`);
    else try { storage?.removeItem(DRAFT_KEY); } catch {}
  }
  const applyBtn = () => { $("#run").textContent = running ? t("loading") : t("run"); };
  function updateRunBtn() { $("#run").disabled = !$("#consent").checked || !!running; applyBtn(); }

  async function mkLetter() {
    if (!last || stale) return;
    const at = gen, r0 = last;
    const res = await fetch("/api/letter", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ findings: last.findings, summary: last.summary, lang: $("#letterLang").value, mode: { ai: !!isAi(last.provider), label: last.provider?.label, model: last.provider?.model } }) });
    if (!res.ok) return;
    const text = (await res.json()).text;
    if (gen !== at || last !== r0 || stale) return; // документы или дело сменились, пока готовилось письмо
    const box = $("#letter"); box.textContent = text; box.hidden = false; $("#copyLetter").hidden = false;
  }

  document.querySelectorAll("[data-lang]").forEach((b) => b.addEventListener("click", () => { lang = b.dataset.lang; try { localStorage.setItem("td:lang", lang); } catch {} applyLang(); }));
  $("#run").addEventListener("click", run);

  // файлы: общая зона (тип по содержимому) и кнопка/перетаскивание в колонку (тип задан колонкой)
  let pickType = null;
  $("#pickAll").addEventListener("click", () => $("#fileAll").click());
  $("#fileAll").addEventListener("change", (e) => { uploadMany([...e.target.files], null); e.target.value = ""; });
  let autoRun = false; // «Загрузить исправленный документ»: после загрузки сразу проверить заново
  document.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => { pickType = b.dataset.pick; autoRun = false; $("#fileOne").click(); }));
  $("#fixBtn").addEventListener("click", () => { pickType = $("#fixType").value; autoRun = true; $("#fileOne").click(); });
  $("#fileOne").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    const go = autoRun; autoRun = false;
    if (!f || !pickType) return;
    const type = pickType;
    await upload(f, type);
    if (go && sources[type] && !sources[type].error) run();
  });
  function dropTarget(node, type) {
    node.addEventListener("dragover", (e) => { e.preventDefault(); e.stopPropagation(); node.classList.add("over"); });
    node.addEventListener("dragleave", () => node.classList.remove("over"));
    node.addEventListener("drop", (e) => {
      e.preventDefault(); e.stopPropagation(); node.classList.remove("over");
      if (!$("#consent").checked) { $("#consentHint").textContent = t("consent_needed"); return; }
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length) uploadMany(type ? files.slice(0, 1) : files, type);
    });
  }
  dropTarget($("#drop"), null);
  document.querySelectorAll("[data-doc]").forEach((d) => dropTarget(d, d.dataset.doc));
  // файл, брошенный мимо зоны, браузер не должен открывать вместо страницы
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());
  ids.forEach((id) => $("#t-" + id).addEventListener("input", () => { renderSource(id); docsChanged(); }));
  $("#mkLetter").addEventListener("click", mkLetter);
  $("#copyLetter").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("#letter").textContent); const b = $("#copyLetter"); b.textContent = t("copied"); setTimeout(() => { b.textContent = t("copy"); }, 1500); } catch {}
  });

  // ---- дело груза: только localStorage этого браузера, на сервер не уходит ----
  let storage = null;
  try { storage = window.localStorage; } catch {}
  let { state: st, error: storeErr } = CS.loadState(storage);
  if (!storage) storeErr = "unavailable";
  const locale = () => (lang === "ru" ? "ru-RU" : lang === "kk" ? "kk-KZ" : "en-GB");
  const fmtTime = (ms) => new Date(ms).toLocaleString(locale(), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const fmtDay = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString(locale()) : "—");
  function showStoreErr() { const w = $("#caseWarn"); w.hidden = !storeErr; w.textContent = storeErr ? t("st_err_" + storeErr) : ""; }
  function persist() {
    if (!storage) { storeErr = "unavailable"; return showStoreErr(); }
    const res = CS.saveState(storage, st);
    storeErr = res.ok ? null : res.error;
    showStoreErr();
  }

  function renderCase() {
    const c = CS.currentCase(st);
    const sel = $("#caseSel"); sel.textContent = "";
    if (!st.cases.length) { const o = el("option", null, "—"); o.value = ""; sel.append(o); }
    for (const x of [...st.cases].sort((a, b) => b.updatedAt - a.updatedAt)) {
      const o = el("option", null, `${x.title || t("case_untitled")} · ${fmtTime(x.createdAt)}`);
      o.value = x.id; o.selected = x.id === st.current; sel.append(o);
    }
    $("#caseDel").disabled = !c;
    $("#caseName").value = c?.title ?? "";
    $("#caseDep").value = c?.departure ?? "";
    const n = c ? CS.daysUntil(c.departure) : null, due = $("#caseDue");
    due.hidden = n === null;
    due.className = "badge " + (n === null ? "" : n < 0 ? "high" : n <= 1 ? "medium" : "ok");
    due.textContent = n === null ? "" : n > 0 ? fmt("due_in", { n }) : n === 0 ? t("due_today") : t("due_past");

    const docsBox = $("#caseDocs"); docsBox.textContent = "";
    for (const type of ids) {
      const row = el("div", "vrow"); row.append(el("b", null, DOCN[lang][type]));
      const list = c?.docs[type] ?? [];
      if (!list.length) row.append(el("span", "note", t("no_versions")));
      list.forEach((ver, i) => {
        const b = el("button", "vchip", "v" + ver.v); b.type = "button";
        b.title = fmtTime(ver.at) + (ver.name ? " · " + ver.name : "");
        b.setAttribute("aria-label", `${DOCN[lang][type]} v${ver.v}, ${b.title}`);
        if (i === list.length - 1) b.setAttribute("aria-current", "true");
        b.addEventListener("click", () => showDiff(type, i));
        row.append(b);
      });
      docsBox.append(row);
    }

    const hist = $("#caseHist"); hist.textContent = "";
    const checks = c?.checks ?? [];
    if (!checks.length) { const li = el("li", "note", t("no_checks")); li.style.listStyle = "none"; hist.append(li); }
    for (let i = checks.length - 1; i >= 0; i--) {
      const e = checks[i], prev = checks[i - 1];
      const li = el("li");
      li.append(el("div", null, `${fmtTime(e.at)} · ${ids.filter((x) => e.versions[x]).map((x) => `${DOCN[lang][x]} v${e.versions[x]}`).join(", ")} · ${e.passed}/${e.total}`));
      if (prev && e.changed?.length) li.append(el("div", null, `${t("h_changed")}: ${e.changed.map((ch) => `${DOCN[lang][ch.type]} ${ch.from ? `v${ch.from} → ` : ""}v${ch.to}`).join(", ")}`));
      if (prev) {
        const d = CS.diffChecks(prev, e);
        const nm = (id) => L([...e.findings, ...prev.findings].find((f) => f?.id === id)?.title) || id;
        if (d.fixed.length) li.append(el("div", "ok", `${t("h_fixed")}: ${d.fixed.map(nm).join(", ")}`));
        if (d.lost?.length) li.append(el("div", null, `${t("h_lost")}: ${d.lost.map(nm).join(", ")}`));
        if (d.added.length) li.append(el("div", "bad", `${t("h_added")}: ${d.added.map(nm).join(", ")}`));
        li.append(el("div", null, `${t("h_still")}: ${e.findings.length}`));
      } else li.append(el("div", null, t("h_first")));
      hist.append(li);
    }
  }

  // что изменилось в документе между версиями: только удалённые и добавленные строки
  function showDiff(type, i) {
    const c = CS.currentCase(st); if (!c) return;
    const list = c.docs[type], cur = list[i], prev = list[i - 1];
    const box = $("#docDiff"); box.hidden = false; box.textContent = "";
    if (!prev) { box.append(el("div", null, fmt("diff_first", { doc: DOCN[lang][type], v: cur.v }))); return; }
    const d = CS.lineDiff(prev.text, cur.text).filter((x) => x.op !== "same");
    box.append(el("div", null, fmt("diff_head", { doc: DOCN[lang][type], a: prev.v, b: cur.v, d: d.filter((x) => x.op === "del").length, p: d.filter((x) => x.op === "add").length })));
    if (!d.length) box.append(el("div", null, t("diff_same")));
    for (const x of d) box.append(el("div", x.op, (x.op === "add" ? "+ " : "− ") + x.line));
  }

  // последние версии документов дела обратно в поля
  function loadCaseDocs(c) {
    for (const type of ids) {
      const e = c?.checks.at(-1);
      const v = !c ? null : e ? (e.versions[type] ? c.docs[type].find((x) => x.v === e.versions[type]) ?? null : null) : CS.latest(c, type);
      $("#t-" + type).value = v?.text ?? "";
      if (v && (v.name || v.origin !== "text")) sources[type] = { name: v.name, kind: "restored", v: v.v, origin: v.origin, text: v.text, extraction: v.extraction };
      else delete sources[type];
      renderSource(type);
    }
    gen++; clearResult(); $("#docDiff").hidden = true;
  }

  $("#caseSel").addEventListener("change", (e) => {
    if (!e.target.value) return;
    st.current = e.target.value; persist(); renderCase(); loadCaseDocs(CS.currentCase(st));
  });
  $("#caseNew").addEventListener("click", () => {
    if (!CS.newCase(st, {})) { const w = $("#caseWarn"); w.hidden = false; w.textContent = t("case_limit"); return; }
    persist(); renderCase(); loadCaseDocs(null); $("#caseName").focus();
  });
  $("#caseDel").addEventListener("click", () => {
    const c = CS.currentCase(st);
    if (!c || !confirm(t("del_confirm"))) return;
    CS.deleteCase(st, c.id); persist(); renderCase(); loadCaseDocs(CS.currentCase(st));
  });
  // «Удалить все мои данные»: все ключи td:* этого сайта в браузере (дела, согласие, язык) и поля на странице
  $("#caseWipe").addEventListener("click", () => {
    if (!confirm(t("wipe_confirm"))) return;
    if (storage) {
      CS.clearAll(storage);
      try { for (const k of Object.keys(storage)) if (k.startsWith("td:")) storage.removeItem(k); } catch {}
    }
    clearTimeout(draftTimer);
    try { storage?.removeItem(DRAFT_KEY); } catch {}
    st = CS.emptyState(); storeErr = storage ? null : "unavailable";
    $("#consent").checked = false; applyConsent();
    showStoreErr(); renderCase(); loadCaseDocs(null); $("#dropStatus").textContent = "";
  });

  // согласие перед загрузкой: без него загрузка и проверка недоступны
  const CONSENT_KEY = "td:consent", CONSENT_VERSION = "2026-11-03";
  try { $("#consent").checked = storage?.getItem(CONSENT_KEY) === CONSENT_VERSION; } catch {}
  function applyConsent() {
    const ok = $("#consent").checked;
    for (const n of document.querySelectorAll("#pickAll, #loadPack, [data-pick], #fixBtn")) n.disabled = !ok;
    updateRunBtn();
    $("#drop").classList.toggle("off", !ok);
    $("#consentHint").textContent = ok ? "" : t("consent_needed");
  }
  $("#consent").addEventListener("change", () => {
    try { if ($("#consent").checked) storage?.setItem(CONSENT_KEY, CONSENT_VERSION); else storage?.removeItem(CONSENT_KEY); } catch {}
    applyConsent();
  });
  function renderLegalLinks() {
    const box = $("#legalLinks"); box.textContent = "";
    const l = lang === "en" ? "en" : lang === "kk" ? "kk" : "ru";
    ["TERMS", "PRIVACY", "CONSENT", "DISCLAIMER"].forEach((d, i) => {
      if (i) box.append(" · ");
      const a = el("a", null, t("l_" + d)); a.href = `/legal/${l}/${d}.md`; a.target = "_blank"; a.rel = "noopener";
      box.append(a);
    });
  }
  for (const [key, id] of [["title", "#caseName"], ["departure", "#caseDep"]]) {
    $(id).addEventListener("change", () => {
      const c = CS.currentCase(st) ?? CS.newCase(st, {});
      if (!c) { const w = $("#caseWarn"); w.hidden = false; w.textContent = t("case_limit"); return; }
      CS.updateCase(c, { [key]: $(id).value }); persist(); renderCase();
    });
  }

  // печатный отчёт: замечания с цитатами и страницами; «правильных» значений и расчётов в нём нет
  function buildPrint() {
    const r = last; if (!r || stale) return false;
    const c = CS.currentCase(st);
    const e = c && lastCaseId === c.id && c.checks.includes(lastEntry) ? lastEntry : null;
    const prev = e ? c.checks[c.checks.indexOf(e) - 1] : null;
    const P = $("#printReport"); P.textContent = "";
    const add = (tag, cls, text) => { const n = el(tag, cls, text); P.append(n); return n; };
    const q = (s) => t("ql") + s + t("qr");
    const quoteLine = (ev) => `${DOCN[lang][ev.doc] ?? ev.doc}, ${t("page")} ${ev.page}: ${q(ev.quote)}${ev.origin === "photo" ? ` (${t("photo_tag")})` : ""}`;
    add("h1", null, t("pr_title"));
    add("div", null, `${t("pr_case")}: ${c?.title || t("case_untitled")}`);
    add("div", null, `${t("pr_dep")}: ${fmtDay(c?.departure)}`);
    add("div", null, `${t("pr_at")}: ${new Date(e?.at ?? Date.now()).toLocaleString(locale())}`);
    add("div", null, `${t("pr_mode")}: ${isAi(r.provider) ? fmt("mode_ai", { label: r.provider.label, model: r.provider.model }) + (r.provider.demoOnly ? ` (${t("mode_free")})` : "") : t("mode_mock")}`);
    if (r.aiUnavailable) add("div", null, t("ai_down"));
    add("h2", null, t("pr_docs"));
    for (const type of ids) {
      const n = e?.versions?.[type]; if (!n) continue;
      const v = c.docs[type].find((x) => x.v === n);
      add("div", null, `${DOCN[lang][type]} v${n}${v?.name ? " · " + v.name : ""} · ${t("src_" + (v?.origin || "text"))}`);
    }
    add("h2", null, t("pr_result"));
    add("div", null, fmt("pr_passed", { p: r.passed, t: r.total, s: r.skipped }));
    if (prev && e) {
      const d = CS.diffChecks(prev, e);
      const nm = (id) => L([...e.findings, ...prev.findings].find((f) => f?.id === id)?.title) || id;
      add("h2", null, t("pr_changes"));
      add("div", null, `${t("h_fixed")}: ${d.fixed.map(nm).join(", ") || "—"}`);
      add("div", null, `${t("h_added")}: ${d.added.map(nm).join(", ") || "—"}`);
      add("div", null, `${t("h_still")}: ${e.findings.length}`);
    }
    add("h2", null, t("pr_findings"));
    if (!r.findings.length) add("div", null, t("pr_none"));
    r.findings.forEach((f, i) => {
      const b = add("div", "pf");
      b.append(el("div", null, `${i + 1}. ${L(f.title)} · ${t("sev_" + f.severity)}`));
      for (const ev of f.evidence) b.append(el("div", "q", quoteLine(ev)));
    });
    const unsure = r.checks.filter((x) => x.status === "skip" && x.reasonText);
    if (unsure.length) {
      add("h2", null, t("pr_confirm"));
      for (const x of unsure) {
        const b = add("div", "pf");
        b.append(el("div", null, `${L(x.title)}: ${L(x.reasonText)}`));
        for (const ev of x.evidence) b.append(el("div", "q", quoteLine(ev)));
      }
    }
    // журнал проверки: модель, правила, время, хэши документов; самих файлов нет нигде
    if (r.run) {
      add("h2", null, t("pr_log"));
      add("div", "muted", `${t("pr_log_at")}: ${r.run.at} · ${t("pr_log_app")}: ${r.run.app}`);
      add("div", "muted", `${t("pr_log_model")}: ${r.run.provider}${r.run.model ? " · " + r.run.model : ""}${r.run.fallbackFrom ? ` (${r.run.fallbackFrom} → ${r.run.provider})` : ""}`);
      add("div", "muted", `${t("pr_log_rules")}: ${r.run.rules.source} · ${r.run.rules.version}`);
      if (r.run.packSha256) add("div", "muted", `${t("pr_pack")}: ${r.run.packSha256}`);
      add("div", "muted", t("pr_log_docs") + ":");
      for (const d of r.run.docs) add("div", "q", `${DOCN[lang][d.type] ?? d.type} (${d.origin}${d.mode ? ` · ${d.mode}` : ""}): ${d.textSha256}${d.fileSha256 ? ` · ${d.fileSha256}` : ""}`);
    }
    add("p", "muted", t("disclaimer_short"));
    add("p", "muted", t("pr_novals"));
    add("p", "muted", t("disclaimer"));
    return true;
  }
  $("#printBtn").addEventListener("click", () => { if (buildPrint()) window.print(); });

  // вкладки: щелчок, стрелки влево/вправо, Home/End; кнопки листов; пустые состояния
  document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  $("#tabs").addEventListener("keydown", (e) => {
    const i = TABS.indexOf(document.activeElement?.dataset?.tab);
    if (i < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const n = e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
    showTab(TABS[n], { top: false });
    $("#tabbtn-" + TABS[n]).focus();
  });
  document.querySelectorAll("[data-toggle]").forEach((b) => b.addEventListener("click", () => setRaw(b.dataset.toggle, $("#raw-" + b.dataset.toggle).hidden)));
  document.querySelectorAll("[data-clear]").forEach((b) => b.addEventListener("click", () => { const id = b.dataset.clear; $("#t-" + id).value = ""; delete sources[id]; renderSource(id); docsChanged(); }));
  $("#loadPack").addEventListener("click", () => $("#fileAll").click());
  $("#demoPack").addEventListener("click", () => { if (samples[1]) useSample(samples[1]); });
  $("#goDocs").addEventListener("click", () => showTab("documents"));
  $("#goDocs2").addEventListener("click", () => showTab("documents"));
  applyTab(location.hash.slice(1));

  (async () => {
    try { const c = await (await fetch("/api/config")).json(); modeInfo = c.mode ?? modeInfo; jsonFb = !!c.jsonFallback; maxBytes = c.maxFileBytes || maxBytes; } catch {}
    try { samples = await (await fetch("/api/samples")).json(); } catch {}
    applyLang();
    const c = CS.currentCase(st);
    if (c) loadCaseDocs(c);
    else if (!st.cases.length && samples[1]) fill(samples[1]);
    restoreDraft();
    if (storeErr) $("#dropStatus").append(el("div", "warn", t("st_err_" + storeErr)));
  })();
})();
