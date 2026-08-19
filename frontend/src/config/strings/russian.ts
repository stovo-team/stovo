/**
 * Russian UI strings.
 * Organized by feature area so each section can be handed off independently.
 *
 * To activate Russian as the active language:
 *   In strings/index.ts, replace "./english" with "./russian".
 */

export const strings = {
  // ── Brand ──────────────────────────────────────────────────────────
  brand: {
    name: "Stovo",
    logoTitle: "Stovo",
    /** Shown as the eyebrow on the invite page */
    invitation: "Приглашение",
    /** Shown as the eyebrow on the setup page */
    initialSetup: "Первоначальная настройка",
    /** Eyebrow on the server setup page */
    setup: "Настройка",
  },

  // ── Navigation ─────────────────────────────────────────────────────
  nav: {
    chats: "Чаты",
    storage: "Хранилище",
    plans: "Планы",
    settings: "Настройки",
    admin: "Админ",
    logOut: "Выйти",
    /** aria-label for the nav element */
    ariaLabel: "Навигация по приложению",
    unreadMessages: (count: number) => {
      const mod10 = count % 10;
      const mod100 = count % 100;
      if (mod100 >= 11 && mod100 <= 19) {
        return `${count} непрочитанных сообщений`;
      }
      if (mod10 === 1) {
        return `${count} непрочитанное сообщение`;
      }
      if (mod10 >= 2 && mod10 <= 4) {
        return `${count} непрочитанных сообщения`;
      }
      return `${count} непрочитанных сообщений`;
    },
  },

  // ── Auth — Login ────────────────────────────────────────────────────
  auth: {
    nickname: "Никнейм",
    password: "Пароль",
    logIn: "Войти",
    signingIn: "Вход…",
    newServer: "Новый сервер?",
    createOwnerAccount: "Создать аккаунт владельца",
    changeServerAddress: "Сменить адрес сервера",
    showPassword: "Показать пароль",
    hidePassword: "Скрыть пароль",
    verificationCode: "Код подтверждения",
    sendCodeToArchive: "Отправить код в Архив сообщений",
    sending: "Отправка…",
    verifyAndLogIn: "Подтвердить и войти",
    verifying: "Проверка…",
    deviceCodeHint:
      "Откройте Архив сообщений на устройстве, где вы уже вошли в систему. Код действителен в течение 10 минут.",
  },

  // ── Auth — Setup (owner account creation) ──────────────────────────
  setup: {
    createOwnerAccount: "Создать аккаунт владельца",
    creating: "Создание…",
    alreadySetUp: "Уже настроено?",
    logIn: "Войти",
    changeServerAddress: "Сменить адрес сервера",
  },

  // ── Auth — Invite ───────────────────────────────────────────────────
  invite: {
    role: "Роль",
    usesLeft: "Осталось использований",
    expires: "Истекает",
    openInApp: "Открыть в приложении Stovo",
    orContinueInBrowser: "или продолжить в браузере",
    joinFamily: "Присоединиться к семье",
    joining: "Присоединение…",
  },

  // ── Server setup ────────────────────────────────────────────────────
  serverSetup: {
    title: "Адрес сервера",
    hint: "Введите адрес вашего сервера Stovo. Используйте",
    hintHttps: "https://",
    hintSuffix: "для доменных имён.",
    serverUrl: "URL сервера",
    placeholder: "https://stovo.example.com",
    connect: "Подключиться",
    testingConnection: "Проверка подключения…",
    localNetworkHint: "Для локальной сети:",
    localNetworkExample: "http://192.168.1.100:8000",
  },

  // ── Settings — Navigation labels ───────────────────────────────────
  settings: {
    title: "Настройки",
    yourSpace: "Ваше пространство",
    yourData: "Ваши данные",

    // sidebar items
    appearance: "Оформление",
    appearanceHelper: "Тема, акцент и вид чата",
    notifications: "Уведомления",
    notificationsHelper: "Сообщения, звонки и тихие часы",
    privacyAndSecurity: "Конфиденциальность и безопасность",
    privacyHelper: "Видимость профиля и отчёты о прочтении",
    helpAndAbout: "Помощь и о приложении",
    helpHelper: "Версия и поддержка",

    changeServerAddress: "Сменить адрес сервера",
    tapToPersonalize: "Нажмите для персонализации",

    // profile card
    familyMember: "Член семьи",
    openProfileSettings: "Открыть настройки профиля",
    changeProfilePhoto: "Изменить фото профиля",

    // profile form
    avatarDisplayName: "Отображаемое имя аватара",
    familySpaceName: "Название семейного пространства",
    saveProfile: "Сохранить профиль",
    saving: "Сохранение",
    profileSaved: "Профиль сохранён",
    profilePhotoUpdated: "Фото профиля обновлено",

    // profile detail form
    displayName: "Отображаемое имя",
    emailOptional: "Эл. почта (необязательно)",
    emailPlaceholder: "например, alex@example.com",
    bioOptional: "О себе (необязательно)",
    bioPlaceholder: "Расскажите членам семьи немного о себе…",
    timezone: "Часовой пояс",
    family: "Семья",
    login: "Логин",
    server: "Сервер",

    // password change
    changePassword: "Сменить пароль",
    changePasswordNote: "Это относится только к аккаунту на выбранном сервере.",
    currentPassword: "Текущий пароль",
    newPassword: "Новый пароль",
    confirmNewPassword: "Подтвердите новый пароль",
    changing: "Изменение…",
    passwordChanged: "Пароль изменён. На других устройствах выполнен выход.",

    // android connection
    connectAndroidDevice: "Подключить Android-устройство",
    androidLinkNote:
      "Ссылка не содержит пароля. На новом устройстве запросите код, отправленный в Архив сообщений на этом аккаунте.",
    androidLink: "Ссылка для Android",
    copyConnectionLink: "Скопировать ссылку для подключения",
    connectionLinkCopied:
      "Ссылка для подключения скопирована. Код для входа будет отправлен в Архив сообщений.",

    // close panel
    closeSettingsPanel: "Закрыть панель настроек",
    backToSettings: "Назад к настройкам",

    // family members list
    familySpaceNote: "Ваше общее семейное пространство. Доступ к календарю определяется ролью участника.",
    familyInviteNote:
      "Управление приглашениями и ролями останется доступным здесь по мере расширения функций семьи.",

    // generic placeholder
    sectionComingSoon: "Этот раздел готов к добавлению новых настроек Stovo.",

    logOut: "Выйти",
    savingEllipsis: "Сохранение…",
  },

  // ── Appearance editor ───────────────────────────────────────────────
  appearance: {
    title: "Оформление",
    backToSettings: "Назад к настройкам",

    // section labels
    theme: "Тема",
    accentColour: "Акцентный цвет",
    chatBackground: "Фон чата",
    messageStyle: "Стиль сообщений",
    chatMedia: "Медиа в чате",

    // wallpaper
    photo: "Фото",
    upload: "Загрузить",
    uploadImage: "Загрузить изображение",
    uploading: "Загрузка…",
    removeCustom: "Удалить своё",

    // message style controls
    curvature: "Скругление",
    messageSize: "Размер сообщений",
    bubbleShapePresetsAria: "Предустановки формы сообщений",
    messageFontAria: "Шрифт сообщений",
    densityAria: "Плотность",
    bubbleCurvatureAria: "Скругление пузырей сообщений",

    // toggles
    videoAutoplay: "Автовоспроизведение видео",
    videoAutoplayHelp: "Встроенный предпросмотр без звука, как в Telegram",
    renderMarkdown: "Рендеринг markdown",
    renderMarkdownHelp: "Жирный, курсив, ссылки, код и многое другое",
    enterToSend: "Отправка по Enter",
    enterToSendHelp:
      "Вкл: Enter — отправка, Shift+Enter — новая строка. Выкл: Enter — новая строка, Ctrl/Cmd+Enter — отправка",

    // preview aria
    themePreviewAria: "Предпросмотр темы",
    themeModeAria: "Режим темы",
    accentColourAria: "Акцентный цвет",
    chatBackgroundAria: "Фон чата",

    // accent labels
    customColor: "Свой цвет",
    customAccentAria: "Свой акцентный цвет",
    accentSuffix: "акцент",

    // reset dialog
    resetAppearance: "Сбросить оформление",
    resetAllSettings: "Сбросить все настройки оформления?",
    resetNote: "Ваша тема, акцентный цвет, обои и параметры отображения чата вернутся к значениям по умолчанию Stovo.",
    keepMyTheme: "Оставить мою тему",
    reset: "Сбросить",

    done: "Готово",

    // preview chat bubbles (used in live preview hero)
    previewBubble1: "Семейный ужин в 19:00.",
    previewBubble2: "Я принесу десерт.",
  },

  // ── Notifications settings ──────────────────────────────────────────
  notifications: {
    messages: "Сообщения",
    calls: "Звонки",
    quietHours: "Тихие часы",
    messageNotifications: "Уведомления о сообщениях",
    messagePreview: "Предпросмотр сообщений",
    messageSound: "Звук",
    callNotifications: "Уведомления о звонках",
    ringtoneEnabled: "Мелодия звонка",
    muteNotifications: "Отключить уведомления",
    start: "Начало",
    end: "Конец",
    quietHoursStartAria: "Начало тихих часов",
    quietHoursEndAria: "Окончание тихих часов",
  },

  // ── Privacy & Security ──────────────────────────────────────────────
  privacy: {
    profileVisibility: "Видимость профиля",
    lastSeen: "Был(а) в сети",
    readReceipts: "Отчёты о прочтении",
    readReceiptsHelp: "Показывать другим, когда вы прочитали их сообщения",
    appLock: "Блокировка приложения",
    appLockOn: "Вкл",
    appLockOff: "Выкл",
    blockedMembers: "Заблокированные участники",
    nobody: "Никто",
    family: "Семья",
    visibleToFamily: "Видно всем членам семьи",
    hiddenFromMembers: "Скрыто от других участников",
    block: "Заблокировать",
    unblock: "Разблокировать",
    confirmEnableAppLock: "Подтвердите включение блокировки приложения",
    confirmDisableAppLock: "Подтвердите отключение блокировки приложения",
  },

  // ── Error messages ──────────────────────────────────────────────────
  errors: {
    invalidCredentials: "Неверные учетные данные",
    couldNotSendCode: "Не удалось отправить код подтверждения",
    invalidVerificationCode: "Неверный код подтверждения",
    setupFailed: "Сбой настройки",
    inviteUnavailable: "Приглашение недоступно",
    inviteAcceptanceFailed: "Не удалось принять приглашение",
    couldNotLoadSettings: "Не удалось загрузить настройки",
    couldNotSaveProfile: "Не удалось сохранить профиль",
    couldNotUpdateProfilePhoto: "Не удалось обновить фото профиля",
    couldNotChangePassword: "Не удалось изменить пароль",
    couldNotUpdatePrivacySettings: "Не удалось обновить настройки конфиденциальности",
    couldNotUpdateBlockedMembers: "Не удалось обновить список заблокированных участников",
    couldNotUploadWallpaper: "Не удалось загрузить обои",
    couldNotUpdateAppLock: "Не удалось обновить блокировку приложения",
    wallpaperMustBeImage: "Выберите файл изображения (JPEG, PNG, GIF или WebP).",
    passwordMismatch: "Новый пароль и подтверждение не совпадают",
    pinRequired:
      "Сначала установите PIN-код, графический ключ, пароль или биометрию в настройках Android.",
  },
} as const;

export const russianStrings = strings;
export type RussianStrings = typeof strings;
