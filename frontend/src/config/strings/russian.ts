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
    storage: "Файлы",
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
    newServer: "Новый спейс?",
    createOwnerAccount: "Создать аккаунт владельца",
    changeServerAddress: "Сменить адрес спейса",
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
    changeServerAddress: "Сменить адрес спейса",
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

  // ── Space setup ────────────────────────────────────────────────────
  serverSetup: {
    title: "Адрес спейса",
    hint: "Введите адрес вашего спейса Stovo. Используйте",
    hintHttps: "https://",
    hintSuffix: "для доменных имён.",
    serverUrl: "URL спейса",
    placeholder: "https://stovo.example.com",
    connect: "Подключиться",
    testingConnection: "Проверка подключения…",
    localNetworkHint: "Для локальной сети:",
    localNetworkExample: "http://192.168.1.100:8000",
  },

  // ── Settings — Navigation labels ───────────────────────────────────
  settings: {
    title: "Настройки",
    yourSpace: "Ваш спейс",
    yourData: "Ваши данные",

    // sidebar items
    appearance: "Оформление",
    appearanceHelper: "Тема, акцент и вид чата",
    general: "Общие",
    generalHelper: "Медиа в чате и поведение сообщений",
    chatMedia: "Медиа в чате",
    notifications: "Уведомления",
    notificationsHelper: "Сообщения, звонки и тихие часы",
    privacyAndSecurity: "Конфиденциальность и безопасность",
    privacyHelper: "Видимость профиля и отчёты о прочтении",
    language: "Язык",
    languageHelper: "Язык приложения и перевод",
    languageSystem: "Системный (авто)",
    languageSystemSubtext: (current: string) => `Соответствует языку устройства (${current})`,
    languageEnglish: "English",
    languageRussian: "Русский",
    helpAndAbout: "Помощь и о приложении",
    helpHelper: "Версия и поддержка",
    statistics: "Статистика",
    statisticsHelper: "Активность чата и тренды спейса",


    tapToPersonalize: "Нажмите для персонализации",

    openSectionAria: (section: string) => `Открыть раздел «${section}»`,

    // profile card
    familyMember: "Член семьи",
    openProfileSettings: "Открыть настройки профиля",
    changeProfilePhoto: "Изменить фото профиля",

    // profile form
    avatarDisplayName: "Отображаемое имя аватара",
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
    server: "Спейс",

    // password change
    changePassword: "Сменить пароль",
    changePasswordNote: "Это относится только к аккаунту в выбранном спейсе.",
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
    familySpaceNote: "Ваш общий семейный спейс. Доступ к календарю определяется ролью участника.",
    familyInviteNote:
      "Управление приглашениями и ролями останется доступным здесь по мере расширения функций семьи.",

    // generic placeholder
    sectionComingSoon: "Этот раздел готов к добавлению новых настроек Stovo.",

    keyboardShortcuts: "Горячие клавиши",
    keyboardShortcutsHelper: "Настройка быстрых клавиш и быстрой навигации",

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

    // theme options
    themes: {
      system: "Системная",
      light: "Светлая",
      dark: "Тёмная",
      amoled: "AMOLED",
    },

    // accent options
    accents: {
      blue: "Синий",
      green: "Зелёный",
      purple: "Фиолетовый",
      rose: "Розовый",
      amber: "Янтарный",
      custom: "Свой",
    },

    // wallpaper options
    wallpapers: {
      dots: "Точки",
      paper: "Бумага",
      aurora: "Аврора",
      plain: "Простой",
      custom: "Свой",
    },

    // bubble shape options
    bubbleShapes: {
      rounded: "Закругленный",
      soft: "Мягкий",
      square: "Прямой",
    },

    // message font options
    messageFonts: {
      system: "Системный",
      sans: "Без засечек",
      serif: "С засечками",
      rounded: "Скругленный",
      mono: "Моноширинный",
    },

    // density options
    densities: {
      comfortable: "Комфортная",
      compact: "Компактная",
    },

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
    autoDownloadMedia: "Автозагрузка медиа",
    autoDownloadMediaHelp: "Кэшировать подходящие вложения для просмотра офлайн",
    autoDownloadWiFiOnly: "Только по Wi‑Fi",
    autoDownloadWiFiOnlyHelp: "Не загружать заранее по мобильной сети или при неизвестном типе сети",
    autoDownloadLimit: "Лимит размера автозагрузки",
    autoDownloadLimitHelp: "Файлы больше лимита отображаются как метаданные, пока вы не откроете или не сохраните их",
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
    muteNotifications: "Без звука",
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
    everyone: "Все",
    visibleToEveryone: "Видно всем",
    hiddenFromMembers: "Скрыто от других участников",
    invitationsAndMessages: "Приглашения и сообщения",
    invitationsAndMessagesHelp: "Кто может писать вам и приглашать вас",
    directMessages: "Личные сообщения",
    directMessagesHelp: "Кто может начать с вами личный чат",
    groupInvitations: "Приглашения в группы",
    channelInvitations: "Приглашения в каналы",
    voiceChannelInvitations: "Приглашения в голосовые каналы",
    noOne: "Никто",
    selectedPeople: "Выбранные люди",
    inviteRequests: "Только запросы на приглашение",
    inviteRequestsHelp: "Отправлять приглашения в личные сообщения как запросы.",
    whoCanMessageYou: "Кто может создавать с вами личные чаты?",
    whoCanInviteYou: "Кто может приглашать вас?",
    everyoneInServer: "Все в спейсе",
    everyoneInServerHelp: "Любой участник может начать личный чат.",
    everyoneCanInvite: "Любой с правом добавлять участников может пригласить вас.",
    selectedPeopleMessageHelp: "Только выбранные ниже люди могут начать личный чат.",
    selectedPeopleInviteHelp: "Только выбранные ниже люди могут приглашать вас.",
    noOneMessageHelp: "Никто не может создать с вами личный чат.",
    noOneInviteHelp: "Никто не может добавить вас в этот тип чата.",
    allowedPeople: "Разрешённые люди",
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

  // ── Chats ────────────────────────────────────────────────────────────
  chats: {
    title: "Чаты",
    searchPlaceholder: "Поиск по сообщениям или участникам",
    filters: {
      all: "Все",
      unread: "Непрочитанные",
      groups: "Группы",
      direct: "Личные",
      voice: "Голосовые",
      muted: "Без звука",
    },
    sections: {
      archive: "Архив сообщений",
      voice: "Голосовые каналы",
      channels: "Каналы",
      groups: "Группы",
      dms: "Личные сообщения",
    },
    types: {
      familyChat: "Семейный чат",
      voiceChannel: "Голосовой канал",
      channel: "Канал",
      groupChat: "Групповой чат",
      directChat: "Личный чат",
      generalFamilyChat: "Общий семейный чат",
      directMessage: "Личное сообщение",
      messageArchive: "Архив сообщений",
      membersCount: (count: number) => {
        const mod10 = count % 10;
        const mod100 = count % 100;
        if (mod100 >= 11 && mod100 <= 19) return `${count} участников`;
        if (mod10 === 1) return `${count} участник`;
        if (mod10 >= 2 && mod10 <= 4) return `${count} участника`;
        return `${count} участников`;
      },
      inVoice: (count: number) => `${count} в голосовом / Голосовой канал`,
      privateFamilyRoom: (count: number) => `${count} участников / семейная комната`,
      readOnlyChannel: (count: number) => `${count} участников / информационный канал`,
      groupChatPreview: (count: number) => `${count} участников / групповой чат`,
    },
    details: {
      title: "Информация о чате",
      settings: "Настройки чата",
      name: "Название чата",
      save: "Сохранить",
      cancel: "Отмена",
      message: "Написать",
      mute: "Выключить звук",
      unmute: "Включить звук",
      favorite: "В избранное",
      saved: "Сохранено",
      wallpaper: "Фон чата",
      uploadPhoto: "Загрузить фото",
      changePhoto: "Изменить фото",
      remove: "Удалить",
      familyStorage: "Сохранять медиа в общем хранилище",
      familyStorageHelp: "Сделать медиа этого чата доступными в общем хранилище",
      comments: "Комментарии",
      commentsHelp: "Разрешить участникам комментировать публикации",
      whoCanPin: "Кто может закреплять сообщения",
      everyone: "Все участники",
      adminsOnly: "Только администраторы",
      messageDelay: "Задержка сообщений",
      notificationsSection: "Уведомления",
      notificationsHelp: "Индивидуальные настройки уведомлений для этого чата",
      notificationsMuteLabel: "Звук уведомлений",
      notificationsMuteOff: "Включены",
      notificationsMute1h: "На 1 час",
      notificationsMute8h: "На 8 часов",
      notificationsMute24h: "На 24 часа",
      notificationsMute7d: "На 7 дней",
      notificationsMuteForever: "Навсегда",
      notificationsMutedUntil: (until: string) => `Без звука до ${until}`,
      notificationsMutedPermanently: "Без звука",
      notificationsQuietHours: "Тихие часы",
      notificationsQuietHoursHelp: "Не присылать уведомления в указанный промежуток времени",
      notificationsQuietHoursFrom: "С",
      notificationsQuietHoursTo: "До",
      notificationsScope: "Уведомлять о",
      notificationsScopeAll: "Всех сообщениях",
      notificationsScopeMentions: "Только при упоминании",
      notificationsScopeSpecific: "Выбранных участниках",
      notificationsSpecificMembersHelp: "Присылать уведомления только когда пишут выбранные участники",
      notificationsSearchMembers: "Поиск участников",
      notificationsNoMembersFound: "Участники не найдены",
      notificationsSelectAll: "Выбрать всех",
      notificationsDeselectAll: "Сбросить",
      notificationsAlwaysMentions: "Всегда уведомлять при упоминании",
      notificationsAlwaysMentionsHelp: "Прямые упоминания (@вам) пришлют уведомление даже при фильтрах или тихих часах",
      off: "Выкл",
      on: "Вкл",
      custom: "Своя",
      seconds: "сек",
      members: "Участники",
      addPeople: "Добавить участников",
      addPeopleSearchPlaceholder: "Поиск участников",
      noPeopleToAdd: "Все участники спейса уже добавлены в этот чат.",
      tabs: {
        media: "Медиа",
        audio: "Аудио",
        files: "Файлы",
        links: "Ссылки",
      },
      empty: {
        media: "Пока нет медиа",
        audio: "Пока нет аудио",
        files: "Пока нет файлов",
        links: "Пока нет ссылок",
      },
      openMessage: "К сообщению",
      openLink: "Открыть ссылку",
      email: "Почта",
      timezone: "Часовой пояс",
      saveToArchive: "Сохранить в Архив сообщений",
      savedToArchiveNotice: "Сохранено в Архив сообщений",
      editChatName: "Изменить название чата",
      description: "Описание",
      addDescription: "Добавить описание",
      editDescription: "Изменить описание",
      descriptionPlaceholder: "О чем этот чат?",
      changeChatPhoto: "Изменить фото чата",
      backToChat: "Назад к чату",
    },
    newChat: {
      title: "Новый чат",
      newGroup: "Новая группа",
      newChannel: "Новый канал",
      newVoiceChannel: "Новый голосовой канал",
      directMessage: "Личное сообщение",
      directMessageHint: "Чат тет-а-тет с членом семьи",
      groupHint: "Закрытый чат с выбранными участниками",
      channelHint: "Информационный канал для объявлений",
      groupTitlePlaceholder: "Название группы",
      channelTitlePlaceholder: "Название канала",
      voiceChannelTitlePlaceholder: "Название голосового канала",
      create: "Создать",
      creating: "Создание…",
      soloCreationHint: "Вы можете создать этот чат на 1 человека (для себя) и пригласить участников позже.",
      creatorRole: "Создатель",
      you: "Вы",
    },
    voiceRoom: {
      noUsers: "Нет участников",
      noUsersDescription: "В этом голосовом канале сейчас никого нет. Присоединяйтесь к общению!",
      joinVoiceChannel: "Войти в голосовой канал",
      connecting: "Подключение…",
      callInProgress: "Идет звонок",
      usersInVoice: "Участники голосового канала",
      speaking: "Говорит…",
      muted: "Микрофон выключен",
      connected: "Подключено",
      unmuteMic: "Включить микрофон",
      muteMic: "Выключить микрофон",
      turnOffCamera: "Выключить камеру",
      turnOnCamera: "Включить камеру",
      stopSharingScreen: "Остановить демонстрацию экрана",
      shareScreen: "Демонстрация экрана",
      shrinkCall: "Свернуть голосовой канал",
      expandCall: "Развернуть голосовой канал",
      moreOptions: "Дополнительные параметры",
      settings: "Настройки",
      disconnect: "Выйти из голосового канала",
    },
    composer: {
      messagePlaceholder: "Сообщение",
      postUpdatePlaceholder: "Опубликовать запись",
      sendMessageAria: "Отправить сообщение",
      messageDelayAria: (delay: string) => `Задержка сообщения: ${delay} с`,
      sendDelayRemaining: (label: string) => `Вы сможете отправить следующее сообщение через ${label}`,
      uploading: "Загрузка",
      sending: "Отправка",
      clickToRecordVoice: "Нажмите для записи голосового сообщения",
      clickToSendVoice: "Нажмите для отправки голосового сообщения",
      scheduleMessage: "Запланировать сообщение",
      setReminder: "Установить напоминание",
      sendOptionsAria: "Параметры отправки сообщения",
    },
  },

  // ── Files / Storage ──────────────────────────────────────────────────
  files: {
    title: "Файлы",
    searchPlaceholder: "Поиск файлов",
    uploadFile: "Загрузить файл",
    uploading: "Загрузка…",
    allChats: "Все чаты",
    storageSource: "Источник файлов",
    storageFilters: "Фильтры файлов",
    filters: {
      all: "Все",
      photos: "Фото",
      videos: "Видео",
      audio: "Аудио",
      documents: "Документы",
      canvases: "Холсты",
      checklists: "Списки",
      favorites: "Избранное",
    },
    categories: {
      archive: "АРХИВ СООБЩЕНИЙ",
      voice: "ГОЛОСОВЫЕ КАНАЛЫ",
      family: "СЕМЕЙНЫЕ ЧАТЫ",
      groups: "ГРУППЫ",
      channels: "КАНАЛЫ",
      direct: "ЛИЧНЫЕ ЧАТЫ",
    },
    empty: "Файлы не найдены",
    noFilesInFilter: "В этой категории нет файлов",
    download: "Скачать",
    delete: "Удалить",
    favorite: "В избранное",
    removeFavorite: "Удалить из избранного",
    openInChat: "Открыть в чате",
    familyStorage: "Общее хранилище",
    chatMembers: "Участники чата",
  },

  // ── Plans ────────────────────────────────────────────────────────────
  plans: {
    title: "Планы",
    searchPlaceholder: "Найти событие",
    today: "Сегодня",
    thisWeek: "Неделя",
    threeDays: "3 дня",
    month: "Месяц",
    upcoming: "Предстоящие",
    noPlansRange: "Нет планов в этом периоде.",
    noPlansYet: "Пока нет планов",
    loadingPlans: "Загрузка планов…",
    createPlan: "Создать план",
    newPlan: "Новое событие",
    planTitle: "Название",
    starts: "Начало",
    ends: "Конец",
    allDay: "Весь день",
    location: "Место",
    locationOptional: "Место (необязательно)",
    descriptionOrLink: "Описание / Ссылка",
    descriptionPlaceholder: "Заметки или ссылка на звонок (например https://...)",
    going: "Пойду",
    maybe: "Возможно",
    goingCount: (count: number) => {
      const mod10 = count % 10;
      const mod100 = count % 100;
      if (mod100 >= 11 && mod100 <= 19) return `${count} идут`;
      if (mod10 === 1) return `${count} идёт`;
      return `${count} идут`;
    },
    goingQuestion: "Идёте?",
    yes: "Да",
    no: "Нет",
    createdBy: (name: string) => `Создал(а) ${name}`,
    createdByLabel: "Создал(а)",
    attendees: "Участники",
    additionalAttendees: (count: number) => `Ещё ${count} участников`,
    planDetails: "Детали плана",
    description: "Описание",
    timeZone: "Часовой пояс",
    unknownMember: "Член семьи",
    scheduled: "Запланировано",
    happening: "Сейчас идёт",
    happened: "Завершено",
    openChat: "Открыть чат",
    close: "Закрыть",
  },

  // ── Admin ────────────────────────────────────────────────────────────
  admin: {
    title: "Администрирование",
    adminAccessRequired: "Требуются права администратора.",
    backToAdmin: "Назад в Админку",
    hub: {
      categoriesLabel: "Разделы администратора",
      categories: {
        overview: "Обзор",
        access: "Доступ и роли",
        features: "Функции",
        integrations: "Интеграции",
      },
      appearance: "Внешний вид",
      appearanceDesc: "Общий вид списка чатов для всех клиентов",
      encryption: "Шифрование сообщений",
      encryptionDesc: "Протокол по умолчанию для новых чатов",
      mcp: "MCP коннекторы",
      mcpDesc: "Claude Code, Codex, OpenClaw, Hermes",
      members: "Участники",
      membersDesc: "Члены семьи, роли и управление аккаунтами",
      memberDefaults: "Настройки по умолчанию",
      memberDefaultsDesc: "Конфиденциальность и уведомления для новых участников и устройств",
      serverSettings: "Настройки пространства",
      serverSettingsDesc: "Доставка уведомлений, качество встреч и сроки хранения",
    },
    appearance: {
      title: "Внешний вид",
      chatLayout: "Отображение списка чатов",
      chatLayoutDesc: "Общий вид списка чатов для всех клиентов",
      minimizedLayout: "Компактный вид",
      minimizedLayoutDesc: "Однострочный компактный список чатов",
      spaceOptions: "Параметры спейса",
      customBranding: "Использовать свой брендинг вместо Stovo",
      customBrandingDesc: "Замените название, логотип и цвета Stovo на свой бренд.",
      customDomain: "Собственный домен для спейса",
      customDomainDesc: "Используйте свой веб-адрес для этого спейса.",
      premium: "Премиум",
      saved: "Настройки отображения сохранены для всех",
    },
    defaults: {
      title: "Настройки по умолчанию",
      ownerRequired: "Только владелец спейса может управлять настройками по умолчанию.",
      privacy: "Конфиденциальность по умолчанию",
      privacyHelp: "Применяется при вступлении нового участника. Позже участник может выбрать свои настройки.",
      notifications: "Уведомления по умолчанию",
      notificationProvider: "Провайдер доставки уведомлений",
      firebaseProvider: "Firebase",
      ntfyProvider: "ntfy",
      notificationsHelp: "Применяется при первом использовании нового устройства. Текущие настройки устройства не меняются.",
      saved: "Настройки по умолчанию сохранены",
      loadError: "Не удалось загрузить настройки по умолчанию",
      saveError: "Не удалось сохранить настройки по умолчанию",
    },
    serverSettings: {
      title: "Настройки сервера",
      spaceName: "Название пространства",
      ownerRequired: "Требуется доступ к управлению сервером.",
      guestMeetingQuality: "Качество гостевых встреч",
      screenShareBitrate: "Битрейт демонстрации экрана (кбит/с)",
      cameraBitrate: "Битрейт камеры (кбит/с)",
      groupCallsQuality: "Групповые звонки и голосовые чаты",
      dmCallsQuality: "Личные звонки",
      safetyAndModeration: "Безопасность и модерация",
      aiFunctions: "Функции ИИ",
      translation: "Перевод сообщений",
      callRecording: "Записи звонков",
      aiNotes: "Заметки встречи с ИИ",
      voiceTranscription: "Расшифровка голосовых сообщений",
      disallowedFileTypes: "Запрещённые типы файлов",
      contentSafetyChecks: "Проверка безопасности контента",
      antispam: "Антиспам",
      notConfigured: "Не настроено",
      storageAndRetention: "Хранение и сроки данных",
      fileCompression: "Сжатие файлов",
      fileCompressionHelp: "Уменьшение фото и видео; документы пересжимаются без потери качества, если это возможно.",
      optimizeSize: "Уменьшить размер",
      messageRetention: "Срок хранения сообщений",
      messageRetentionHelp: "Выберите, как долго сообщения хранятся на сервере.",
      inactiveUserDeletion: "Удаление неактивных пользователей",
      inactiveUserDeletionHelp: "Автоматически удалять аккаунты после периода неактивности.",
      never: "Никогда",
      saved: "Настройки сервера сохранены",
      loadError: "Не удалось загрузить настройки сервера",
      saveError: "Не удалось сохранить настройки сервера",
    },
    encryption: {
      title: "Шифрование сообщений",
      protocol: "Протокол шифрования по умолчанию",
      protocolDesc: "Для новых чатов по умолчанию используется шифрование на сервере.",
      serverAtRest: "Шифрование на сервере (по умолчанию)",
      serverAtRestDesc: "Хранятся зашифрованными на сервере, доступны на всех устройствах.",
      e2ee: "Сквозное шифрование (E2EE)",
      e2eeDesc: "Только устройства с приватными ключами могут расшифровать сообщения.",
      premium: "Премиум",
      premiumDesc: "Изменение протокола шифрования сообщений пока доступно только в Премиум.",
      save: "Сохранить настройки шифрования",
      saved: "Настройки шифрования сохранены",
    },
    mcp: {
      title: "MCP коннекторы",
      description: "Управление коннекторами Model Context Protocol для ИИ-ассистентов.",
    },
    rbac: {
      supervisorChatTypes: "Типы чатов, доступные пространству",
      supervisorChatTypesDesc: "Администраторы пространства смогут управлять только включёнными супервайзером типами чатов.",
      chatCreationLimits: "Ограничения создания чатов",
      chatCreationLimitsDesc: "Укажите, может ли эта роль создавать чаты и каких типов.",
      createChats: "Создавать чаты",
      directMessages: "Личные сообщения",
      groupChats: "Групповые чаты",
      textChannels: "Текстовые каналы",
      voiceChats: "Голосовые чаты",
      advancedRestrictions: "Дополнительные ограничения ролей",
      manageAI: "Использовать функции ИИ",
      shareFiles: "Отправлять файлы",
      createInvites: "Создавать приглашения",
      manageIntegrations: "Использовать интеграции",
    },
    members: {
      title: "Участники",
      description: "Члены семьи, роли и управление аккаунтами",
      inviteMember: "Пригласить участника",
      roleOwner: "Владелец",
      roleAdmin: "Админ",
      roleAdult: "Взрослый",
      roleChild: "Ребёнок",
      removeMember: "Удалить участника",
    },
  },

  // ── Invite Modal ─────────────────────────────────────────────────────
  inviteModal: {
    title: (familyName: string) => `Пригласить в ${familyName}`,
    close: "Закрыть окно приглашения",
    creating: "Создание приглашения…",
    qrCode: "QR-код",
    qrAlt: "QR-код приглашения",
    generatingQr: "Генерация QR-кода…",
    copy: "Копировать",
    copied: "Скопировано",
    share: "Поделиться",
    inviteLink: "Ссылка-приглашение",
    shareTitle: (familyName: string) => `Присоединяйтесь к ${familyName} в Stovo`,
    shareText: (familyName: string) => `Присоединяйтесь к нашей семье "${familyName}" в Stovo!`,
    shareDialogTitle: (familyName: string) => `Приглашение в ${familyName}`,
  },

  // ── Message Context Menu ─────────────────────────────────────────────
  contextMenu: {
    react: (emoji: string) => `Реакция ${emoji}`,
    moreReactions: "Больше реакций",
    hideMoreReactions: "Скрыть реакции",
    comment: "Комментировать",
    reply: "Ответить",
    copy: "Копировать",
    pinMessage: "Закрепить сообщение",
    unpinMessage: "Открепить сообщение",
    forward: "Переслать",
    saveToArchive: "Сохранить в Архив сообщений",
    edit: "Изменить",
    delete: "Удалить",
    seenBy: "Просмотрено",
    noReaders: "Пока никто не прочитал",
  },

  comments: {
    title: "Комментарии",
    count: (count: number) => {
      const mod10 = count % 10;
      const mod100 = count % 100;
      if (mod100 >= 11 && mod100 <= 19) return `${count} комментариев`;
      if (mod10 === 1) return `${count} комментарий`;
      if (mod10 >= 2 && mod10 <= 4) return `${count} комментария`;
      return `${count} комментариев`;
    },
    noComments: "Комментариев пока нет",
    firstComment: "Оставьте первый комментарий.",
    write: "Написать комментарий…",
    disabled: "Комментарии отключены",
    disabledInChannel: "Комментарии в этом канале отключены.",
    chooseThread: "Выберите публикацию для комментария.",
  },

  // ── История звонков ───────────────────────────────────────────────────
  callHistory: {
    completed: (duration: string) => `Звонок завершён · ${duration}`,
    completedLabel: "Звонок завершён",
    missed: "Пропущенный звонок",
    declined: "Звонок отклонён",
    canceled: "Звонок отменён",
    failed: "Сбой звонка",
    videoCall: "Видеозвонок",
    audioCall: "Аудиозвонок",
  },

  // ── Редактор аватара ─────────────────────────────────────────────────
  avatarEditor: {
    title: "Редактирование фото профиля",
    chatPhotoTitle: "Редактирование фото",
    zoom: "Масштаб",
    zoomIn: "Увеличить",
    zoomOut: "Уменьшить",
    rotate: "Повернуть",
    reset: "Сбросить",
    cancel: "Отмена",
    apply: "Сохранить фото профиля",
    applyGeneric: "Применить",
    dragHint: "Перетащите для перемещения · Колесико или жест для масштаба",
  },
  wallpaperEditor: {
    title: "Редактирование фона чата",
    previewHelp: "Настройте изображение перед применением к этому чату.",
    preview: "Предпросмотр фона чата",
    chatPreview: "Предпросмотр чата",
    previewIncoming: "Так будет выглядеть фон.",
    previewOutgoing: "Отлично выглядит!",
    messagePlaceholder: "Написать сообщение",
    brightness: "Яркость",
    contrast: "Контраст",
    gamma: "Гамма",
    hue: "Оттенок",
    saturation: "Насыщенность",
    blur: "Размытие",
    adjustments: "Настроить",
    apply: "Применить фон",
  },
  shortcuts: {
    title: "Горячие клавиши",
    subtitle: "Настройте сочетания клавиш для быстрой навигации и управления Stovo",
    resetAll: "Сбросить все на стандартные",
    resetConfirm: "Вы уверены, что хотите сбросить все горячие клавиши к заводским настройкам?",
    resetAction: "Сбросить на стандартную",
    pressKeys: "Нажмите нужное сочетание клавиш…",
    pressEscape: "Нажмите Escape для отмены",
    conflictWarning: "Уже назначено для другого действия",
    browserConflictWarning: "Зарезервировано браузером",
    reassign: "Переназначить",
    cancel: "Отмена",
    save: "Сохранить",
    categories: {
      general: "Общие и палитра",
      navigation: "Навигация",
      chats: "Чаты и список",
      composer: "Переписка и ввод",
      calls: "Звонки и голос",
    },
    actions: {
      quick_switcher: "Быстрый переход",
      quick_switcher_desc: "Открыть палитру поиска для перехода к любому каналу, ЛС или пользователю",
      shortcuts_help: "Горячие клавиши",
      shortcuts_help_desc: "Просмотр и настройка всех горячих клавиш",
      toggle_theme: "Переключить тему",
      toggle_theme_desc: "Переключение между светлой и тёмной темами",
      nav_chats: "Перейти в Чаты",
      nav_chats_desc: "Быстрый переход к экрану чатов",
      nav_files: "Перейти в Файлы",
      nav_files_desc: "Переход к общему хранилищу и файлам",
      nav_plans: "Перейти в Планы",
      nav_plans_desc: "Переход к семейному календарю и планам",
      nav_settings: "Перейти в Настройки",
      nav_settings_desc: "Открыть настройки профиля и устройства",
      next_chat: "Следующий чат",
      next_chat_desc: "Перейти к следующему диалогу в списке",
      prev_chat: "Предыдущий чат",
      prev_chat_desc: "Перейти к предыдущему диалогу в списке",
      new_chat: "Новый чат",
      new_chat_desc: "Открыть окно создания канала, группы или ЛС",
      search_messages: "Поиск сообщений",
      search_messages_desc: "Активировать поиск сообщений в текущем чате",
      focus_composer: "Фокус на поле ввода",
      focus_composer_desc: "Переместить курсор в поле написания сообщения",
      toggle_details: "Сведения о чате",
      toggle_details_desc: "Открыть или закрыть боковую панель информации",
      attach_file: "Прикрепить файл",
      attach_file_desc: "Открыть меню выбора файла для отправки",
      toggle_call: "Начать / переключить звонок",
      toggle_call_desc: "Запустить или переключиться на активный звонок",
      toggle_mute: "Вкл/выкл микрофон",
      toggle_mute_desc: "Включить или отключить звук микрофона во время звонка",
    },
  },
  quickSwitcher: {
    placeholder: "Поиск каналов, личных сообщений, людей или команд…",
    noResults: "Ничего не найдено",
    sectionChannels: "Каналы и группы",
    sectionDms: "Личные сообщения",
    sectionPeople: "Люди",
    sectionActions: "Команды и разделы",
    badgeChannel: "Канал",
    badgeGroup: "Группа",
    badgeVoice: "Голос",
    actionToggleTheme: "Переключить тему (светлая / тёмная)",
    actionNewChat: "Создать чат, группу или канал",
    actionShortcuts: "Открыть настройки горячих клавиш",
    actionLogOut: "Выйти из Stovo",
    actionNavChats: "Перейти в Чаты",
    actionNavFiles: "Перейти в Файлы",
    actionNavPlans: "Перейти в Планы",
    actionNavSettings: "Перейти в Настройки",
    actionNavAdmin: "Перейти в Панель управления",
    hintNavigation: "Навигация",
    hintSelect: "Выбрать",
    hintClose: "Закрыть",
    hintFilterPrefixes: "Подсказка: # для каналов, @ для людей, > для команд",
  },

  audioPlayer: {
    text: "Текст",
    hide: "Скрыть",
    transcribe: "Расшифровать голосовое сообщение",
    hideTranscript: "Скрыть расшифровку",
    showTranscript: "Показать расшифровку",
    transcribingWithAi: "Расшифровка аудио с помощью ИИ...",
    transcript: "Расшифровка",
    collapseTranscript: "Свернуть расшифровку",
    expandTranscript: "Развернуть расшифровку",
    playAudio: "Воспроизвести аудио",
    pauseAudio: "Приостановить аудио",
    seekAudio: "Перемотка аудио",
    audioTime: "Время аудио",
    retry: "Повторить",
    retryAudio: "Повторить воспроизведение",
    audioMessage: "Аудиосообщение",
    callActiveStatus: "Воспроизведение приостановлено во время звонка.",
    suppressedStatus: "Воспроизведение приостановлено другим приложением.",
    couldNotPlay: "Не удалось воспроизвести аудио.",
    couldNotPlayRetry: "Не удалось воспроизвести аудио. Попробуйте снова.",
    formatUnsupported: "Этот аудиоформат не поддерживается на этом устройстве.",
    noLongerAvailable: "Это аудиосообщение больше недоступно.",
    networkError: "Не удалось загрузить аудио. Проверьте соединение и попробуйте снова.",
  },
};



export const russianStrings = strings;
export type RussianStrings = typeof strings;
