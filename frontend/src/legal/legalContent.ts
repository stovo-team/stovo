import { appRelease } from "./appRelease";

export type LegalLanguage = "en" | "ru";
export type LegalDocumentId = "privacy" | "terms" | "data" | "release-notes";

export interface LegalSection {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface LegalDocument {
  id: LegalDocumentId;
  title: string;
  summary: string;
  updatedLabel: string;
  sections: LegalSection[];
}

export const legalContact = {
  operator: "ИП Стахов Иван",
  operatorEnglish: "Sole Proprietor Ivan Stakhov",
  address: "7 мкр. 16А",
  addressEnglish: "7th Microdistrict, 16A",
  email: "support@stovo.ru"
} as const;

const en: Record<LegalDocumentId, LegalDocument> = {
  privacy: {
    id: "privacy",
    title: "Privacy Policy",
    summary: "How Stovo handles account, communication, and technical data.",
    updatedLabel: "Effective 13 September 2026",
    sections: [
      {
        title: "1. Who is responsible for Stovo",
        paragraphs: [
          `The service operator for Stovo is ${legalContact.operatorEnglish} ("we", "us", or "Stovo"). You can contact us at ${legalContact.addressEnglish} or by email at ${legalContact.email}.`,
          "This policy applies to the Stovo application, its website, and any Stovo space that we operate. A family or organisation running its own Stovo server is responsible for its own server, users, and local privacy notices."
        ]
      },
      {
        title: "2. Data we process",
        bullets: [
          "Account and profile data: display name, username, email address when supplied, profile photo, biography, time zone, role, and privacy preferences.",
          "Communication data: messages, replies, reactions, comments, calls and related activity, calendar items, checklists, canvases, and files you or other members share.",
          "Security and technical data: authentication and session information, device or browser details, IP address, connection logs, diagnostic logs, and security events.",
          "Support data: information you provide when contacting us, including correspondence and attachments."
        ]
      },
      {
        title: "3. Why we use data",
        bullets: [
          "To create and administer accounts, deliver chats, calls, file storage, and other requested features.",
          "To protect accounts, prevent abuse, investigate incidents, and maintain the reliability of the service.",
          "To communicate about support requests, material changes, service notices, and security matters.",
          "To meet legal obligations and resolve disputes where applicable."
        ]
      },
      {
        title: "4. Sharing and storage",
        paragraphs: [
          "Your content is visible to the members, administrators, and invited participants of the relevant Stovo space according to that space's permissions. We do not sell personal data or use it for targeted advertising.",
          "Stovo uses service providers only where needed to operate the service, such as hosting, database, storage, communications, and security providers. They may process data only on our instructions and for those purposes. We may disclose information when required by law or to protect people, rights, property, or the security of the service."
        ]
      },
      {
        title: "5. Retention and deletion",
        paragraphs: [
          "We retain data while an account or space is active and for as long as reasonably necessary for the purposes described here, including security, backups, dispute handling, and legal obligations. Administrators of a space may set or apply additional retention rules.",
          `To request access, correction, export, or deletion of personal data, contact ${legalContact.email}. We may need to verify your identity and may retain limited information when required by law or for legitimate security and record-keeping needs.`
        ]
      },
      {
        title: "6. Security and children",
        paragraphs: [
          "We use reasonable technical and organisational measures designed to protect data. No internet service can guarantee absolute security; protect your password, keep devices secure, and report suspicious access promptly.",
          "Stovo is designed for private family spaces. A parent, guardian, or authorised space administrator is responsible for creating and supervising accounts for minors and for obtaining any consent required in their location."
        ]
      },
      {
        title: "7. Changes and contact",
        paragraphs: [
          "We may update this policy when the service or applicable requirements change. The current version and effective date are available in Help and About. For privacy questions or requests, contact us using the details above."
        ]
      }
    ]
  },
  terms: {
    id: "terms",
    title: "Terms and Conditions",
    summary: "The rules for using Stovo and participating in a Stovo space.",
    updatedLabel: "Effective 13 September 2026",
    sections: [
      {
        title: "1. Acceptance and service",
        paragraphs: [
          `These Terms govern your use of Stovo, provided by ${legalContact.operatorEnglish}. By creating an account, accepting an invite, or using Stovo, you agree to these Terms and the Privacy Policy. If you do not agree, do not use the service.`,
          "Stovo is a private communication and collaboration service. Features may vary by platform, plan, server configuration, and release."
        ]
      },
      {
        title: "2. Accounts and spaces",
        bullets: [
          "Provide accurate information, keep login credentials confidential, and notify us promptly of unauthorised access.",
          "Space owners and administrators are responsible for invitations, member roles, settings, content moderation, and lawful use of their spaces.",
          "You must be old enough to enter a binding agreement where you live. A parent, guardian, or authorised adult must create or supervise a minor's account where required."
        ]
      },
      {
        title: "3. Acceptable use",
        bullets: [
          "Do not break the law or infringe another person's rights, privacy, intellectual property, or safety.",
          "Do not send malware, spam, deceptive content, unlawful content, or material that exploits or harms minors.",
          "Do not interfere with the service, probe it without permission, bypass security controls, or use automated means that burden the service.",
          "Do not impersonate others or use Stovo to harass, threaten, or abuse people."
        ]
      },
      {
        title: "4. Your content",
        paragraphs: [
          "You retain rights in content you submit. You grant us the limited rights necessary to host, process, transmit, back up, display, and secure that content for operating Stovo and the relevant space. You are responsible for having the rights and permissions needed to share content.",
          "We may remove or restrict content or accounts that violate these Terms, law, or the safety and operation of the service."
        ]
      },
      {
        title: "5. Availability, changes, and ending use",
        paragraphs: [
          "We aim to provide a reliable service, but it is provided on an 'as available' basis. Maintenance, network conditions, third-party services, and other events may affect availability. We may change, suspend, or discontinue features with reasonable notice where practical.",
          "You may stop using Stovo at any time. We may suspend or end access if you materially breach these Terms, create risk for others or the service, or where required by law."
        ]
      },
      {
        title: "6. Liability and governing requirements",
        paragraphs: [
          "Nothing in these Terms excludes rights or liability that cannot legally be excluded. To the maximum extent permitted by applicable law, Stovo is not liable for indirect, incidental, special, consequential, or punitive losses, or for loss of data, profits, or goodwill arising from use of the service.",
          "These Terms are governed by the mandatory laws applicable to the service operator and the user. Any consumer protections that apply in your place of residence remain unaffected."
        ]
      },
      {
        title: "7. Changes and contact",
        paragraphs: [
          `We may revise these Terms. Continued use after the updated effective date means you accept the revised Terms where permitted by law. Questions can be sent to ${legalContact.email}.`
        ]
      }
    ]
  },
  data: {
    id: "data",
    title: "Data, Security, and Support",
    summary: "Practical information about safeguarding an account and requesting help.",
    updatedLabel: "Updated 13 September 2026",
    sections: [
      {
        title: "Keep your account safe",
        bullets: [
          "Use a unique, strong password and do not share it.",
          "Lock your device and enable the app lock when it is available.",
          "Review member roles and invitations regularly if you administer a space.",
          "Only open links and files you trust; report suspicious activity promptly."
        ]
      },
      {
        title: "Your privacy controls",
        paragraphs: [
          "In Settings → Privacy and Security, you can manage profile and last-seen visibility, read receipts, invitations and direct-message permissions, blocked members, and app lock where supported. Those controls affect what other space members can see; they do not remove information already shared with them."
        ]
      },
      {
        title: "Data requests and support",
        paragraphs: [
          `For support, privacy requests, or to report a security concern, email ${legalContact.email}. Include the Stovo space address, your account name, the device or browser involved, and a concise description. Do not send passwords or one-time codes.`,
          "We may ask for enough information to verify identity before acting on an account or personal-data request."
        ]
      }
    ]
  },
  "release-notes": {
    id: "release-notes",
    title: "Release Notes",
    summary: "What is included in the current Stovo release.",
    updatedLabel: "Published 13 September 2026",
    sections: [
      {
        title: `Stovo ${appRelease.version} — current release`,
        bullets: [
          "Expanded family messaging with channels, groups, direct messages, reactions, replies, shared attachments, message archive, and file library.",
          "Audio and video calling improvements, including screen sharing, device controls, picture-in-picture support where available, and call history.",
          "New collaboration tools: plans and calendar events, checklists, canvases, polls, comments, and guest meetings.",
          "More control over privacy, invitations, direct messages, app appearance, notifications, language, keyboard shortcuts, and app locking on supported Android devices.",
          "Administration improvements for member roles, default settings, encryption choices, public access, connectors, plugins, and server statistics.",
          "This release also adds the Help and About centre, Privacy Policy, Terms and Conditions, and public support contact details."
        ]
      },
      {
        title: "Version information",
        paragraphs: [
          `Product release: ${appRelease.version}. Android package version: ${appRelease.version}. Web build manifest version: ${appRelease.webBuild}.`,
          "Installations may receive features and fixes at different times depending on the server and app distribution channel."
        ]
      }
    ]
  }
};

const ru: Record<LegalDocumentId, LegalDocument> = {
  privacy: {
    id: "privacy",
    title: "Политика конфиденциальности",
    summary: "Как Stovo обрабатывает данные аккаунта, общения и технические данные.",
    updatedLabel: "Действует с 13 сентября 2026 года",
    sections: [
      { title: "1. Кто отвечает за Stovo", paragraphs: [`Оператор сервиса Stovo — ${legalContact.operator} («мы», «нас» или «Stovo»). С нами можно связаться по адресу: ${legalContact.address}; электронная почта: ${legalContact.email}.`, "Эта политика относится к приложению Stovo, его сайту и любому пространству Stovo, которым управляем мы. Семья или организация, самостоятельно запускающая сервер Stovo, отвечает за свой сервер, пользователей и локальные уведомления о конфиденциальности."] },
      { title: "2. Какие данные мы обрабатываем", bullets: ["Данные аккаунта и профиля: отображаемое имя, логин, адрес электронной почты (если указан), фото профиля, описание, часовой пояс, роль и настройки приватности.", "Данные общения: сообщения, ответы, реакции, комментарии, звонки и связанная с ними активность, планы, чек-листы, холсты и файлы, которыми вы или другие участники делитесь.", "Данные безопасности и технические данные: сведения об аутентификации и сессии, данные устройства или браузера, IP-адрес, журналы подключений, диагностические журналы и события безопасности.", "Данные поддержки: информация, которую вы передаёте при обращении к нам, включая переписку и вложения."] },
      { title: "3. Для чего мы используем данные", bullets: ["Для создания и администрирования аккаунтов, работы чатов, звонков, хранения файлов и других запрошенных функций.", "Для защиты аккаунтов, предотвращения злоупотреблений, расследования инцидентов и поддержания надёжности сервиса.", "Для ответов на запросы поддержки, важных изменений, сервисных уведомлений и вопросов безопасности.", "Для выполнения применимых юридических обязанностей и урегулирования споров."] },
      { title: "4. Передача и хранение", paragraphs: ["Ваш контент виден участникам, администраторам и приглашённым пользователям соответствующего пространства Stovo в соответствии с его правами доступа. Мы не продаём персональные данные и не используем их для таргетированной рекламы.", "Мы привлекаем поставщиков услуг только там, где это необходимо для работы сервиса: хостинг, базы данных, хранение, коммуникации и безопасность. Они могут обрабатывать данные только по нашим инструкциям и для этих целей. Мы можем раскрыть информацию, если этого требует закон или если это необходимо для защиты людей, прав, имущества или безопасности сервиса."] },
      { title: "5. Срок хранения и удаление", paragraphs: ["Мы храним данные, пока аккаунт или пространство активно, а также столько, сколько разумно необходимо для описанных целей, включая безопасность, резервные копии, урегулирование споров и юридические обязанности. Администраторы пространства могут применять дополнительные правила хранения.", `Чтобы запросить доступ, исправление, экспорт или удаление персональных данных, напишите на ${legalContact.email}. Мы можем попросить подтвердить личность и сохранить ограниченную информацию, когда этого требует закон или обоснованные задачи безопасности и учёта.`] },
      { title: "6. Безопасность и дети", paragraphs: ["Мы применяем разумные технические и организационные меры для защиты данных. Ни один интернет-сервис не может гарантировать абсолютную безопасность; защищайте пароль, держите устройства в безопасности и незамедлительно сообщайте о подозрительном доступе.", "Stovo создан для частных семейных пространств. Родитель, опекун или уполномоченный администратор пространства отвечает за создание и контроль аккаунтов несовершеннолетних, а также за получение согласия, если оно требуется по месту проживания."] },
      { title: "7. Изменения и контакты", paragraphs: ["Мы можем обновлять эту политику при изменении сервиса или применимых требований. Актуальная версия и дата вступления в силу доступны в разделе «Помощь и о приложении». По вопросам конфиденциальности обращайтесь по указанным выше контактам."] }
    ]
  },
  terms: {
    id: "terms",
    title: "Условия использования",
    summary: "Правила использования Stovo и участия в пространстве Stovo.",
    updatedLabel: "Действуют с 13 сентября 2026 года",
    sections: [
      { title: "1. Принятие условий и сервис", paragraphs: [`Эти Условия регулируют использование Stovo, который предоставляет ${legalContact.operator}. Создавая аккаунт, принимая приглашение или используя Stovo, вы соглашаетесь с этими Условиями и Политикой конфиденциальности. Если вы не согласны, не используйте сервис.`, "Stovo — сервис для частного общения и совместной работы. Функции могут различаться в зависимости от платформы, тарифа, конфигурации сервера и версии."] },
      { title: "2. Аккаунты и пространства", bullets: ["Указывайте достоверные данные, храните учётные данные в тайне и сразу сообщайте нам о несанкционированном доступе.", "Владельцы и администраторы пространства отвечают за приглашения, роли участников, настройки, модерацию контента и законное использование своих пространств.", "Вы должны быть достаточно взрослым, чтобы заключать обязательные соглашения по законам места вашего проживания. Если этого требует закон, аккаунт несовершеннолетнего должен создавать или контролировать родитель, опекун или уполномоченный взрослый."] },
      { title: "3. Допустимое использование", bullets: ["Не нарушайте закон и права, конфиденциальность, интеллектуальную собственность или безопасность других лиц.", "Не отправляйте вредоносные программы, спам, обманный или незаконный контент, а также материалы, эксплуатирующие или причиняющие вред несовершеннолетним.", "Не мешайте работе сервиса, не исследуйте его без разрешения, не обходите меры безопасности и не используйте автоматизированные средства, создающие нагрузку на сервис.", "Не выдавайте себя за других людей и не используйте Stovo для преследования, угроз или оскорблений."] },
      { title: "4. Ваш контент", paragraphs: ["Вы сохраняете права на предоставляемый контент. Вы предоставляете нам ограниченные права, необходимые для размещения, обработки, передачи, резервного копирования, отображения и защиты этого контента в целях работы Stovo и соответствующего пространства. Вы отвечаете за наличие прав и разрешений, необходимых для публикации контента.", "Мы можем удалить или ограничить доступ к контенту или аккаунтам, нарушающим эти Условия, закон либо безопасность и работу сервиса."] },
      { title: "5. Доступность, изменения и прекращение использования", paragraphs: ["Мы стремимся к надёжной работе, но сервис предоставляется по принципу «по мере доступности». Техническое обслуживание, сеть, сторонние сервисы и другие обстоятельства могут влиять на доступность. Мы можем изменять, приостанавливать или прекращать работу функций, по возможности уведомив об этом заранее.", "Вы можете прекратить использование Stovo в любое время. Мы можем приостановить или прекратить доступ при существенном нарушении Условий, риске для других лиц или сервиса, а также когда этого требует закон."] },
      { title: "6. Ответственность и применимые требования", paragraphs: ["Ничто в этих Условиях не исключает права или ответственность, которые нельзя исключить по закону. В максимально допустимой применимым правом степени Stovo не несёт ответственности за косвенные, случайные, специальные, последующие или штрафные убытки, а также за потерю данных, прибыли или деловой репутации, связанную с использованием сервиса.", "Эти Условия регулируются императивными нормами права, применимыми к оператору сервиса и пользователю. Права потребителей, применимые по месту вашего проживания, сохраняются."] },
      { title: "7. Изменения и контакты", paragraphs: [`Мы можем пересматривать эти Условия. Продолжая использовать сервис после даты вступления изменений в силу, вы принимаете обновлённые Условия, если это допускается законом. Вопросы можно направить на ${legalContact.email}.`] }
    ]
  },
  data: {
    id: "data",
    title: "Данные, безопасность и поддержка",
    summary: "Практическая информация о защите аккаунта и получении помощи.",
    updatedLabel: "Обновлено 13 сентября 2026 года",
    sections: [
      { title: "Защитите свой аккаунт", bullets: ["Используйте уникальный надёжный пароль и никому его не сообщайте.", "Блокируйте устройство и включайте блокировку приложения, когда она доступна.", "Если вы администрируете пространство, регулярно проверяйте роли участников и приглашения.", "Открывайте только доверенные ссылки и файлы; незамедлительно сообщайте о подозрительной активности."] },
      { title: "Настройки конфиденциальности", paragraphs: ["В разделе «Настройки → Конфиденциальность и безопасность» можно управлять видимостью профиля и времени последнего посещения, отчётами о прочтении, приглашениями и личными сообщениями, заблокированными участниками и блокировкой приложения на поддерживаемых устройствах. Эти настройки определяют, что видят другие участники пространства; они не удаляют информацию, которой вы уже поделились."] },
      { title: "Запросы данных и поддержка", paragraphs: [`Для поддержки, запроса о персональных данных или сообщения об инциденте безопасности напишите на ${legalContact.email}. Укажите адрес пространства Stovo, имя аккаунта, устройство или браузер и краткое описание. Никогда не отправляйте пароль или одноразовый код.`, "Прежде чем выполнить запрос, связанный с аккаунтом или персональными данными, мы можем попросить информацию для подтверждения личности."] }
    ]
  },
  "release-notes": {
    id: "release-notes",
    title: "История версий",
    summary: "Что входит в текущий выпуск Stovo.",
    updatedLabel: "Опубликовано 13 сентября 2026 года",
    sections: [
      { title: `Stovo ${appRelease.version} — текущий выпуск`, bullets: ["Расширенные семейные чаты: каналы, группы, личные сообщения, реакции, ответы, общие вложения, Архив сообщений и библиотека файлов.", "Улучшения аудио- и видеозвонков: демонстрация экрана, управление устройствами, режим «картинка в картинке» при поддержке устройства и история звонков.", "Новые инструменты совместной работы: планы и календарные события, чек-листы, холсты, опросы, комментарии и гостевые встречи.", "Больше контроля над конфиденциальностью, приглашениями, личными сообщениями, оформлением, уведомлениями, языком, горячими клавишами и блокировкой приложения на поддерживаемых Android-устройствах.", "Улучшения администрирования: роли участников, настройки по умолчанию, выбор шифрования, публичный доступ, коннекторы, плагины и статистика сервера.", "В выпуск добавлены центр «Помощь и о приложении», Политика конфиденциальности, Условия использования и публичные контакты поддержки."] },
      { title: "Сведения о версии", paragraphs: [`Версия продукта: ${appRelease.version}. Версия Android-пакета: ${appRelease.version}. Версия веб-манифеста: ${appRelease.webBuild}.`, "Функции и исправления могут появляться в разное время в зависимости от сервера и канала распространения приложения."] }
    ]
  }
};

export function getLegalDocuments(language: LegalLanguage) {
  return language === "ru" ? ru : en;
}

export function getLegalDocument(language: LegalLanguage, id: LegalDocumentId) {
  return getLegalDocuments(language)[id];
}

export function isLegalDocumentId(value: string | undefined): value is LegalDocumentId {
  return value === "privacy" || value === "terms" || value === "data" || value === "release-notes";
}
