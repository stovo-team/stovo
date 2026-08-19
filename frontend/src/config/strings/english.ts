/**
 * English UI strings — the single file a translator touches.
 * Organized by feature area so each section can be handed off independently.
 */

export const strings = {
  // ── Brand ──────────────────────────────────────────────────────────
  brand: {
    name: "Stovo",
    logoTitle: "Stovo",
    /** Shown as the eyebrow on the invite page */
    invitation: "Invitation",
    /** Shown as the eyebrow on the setup page */
    initialSetup: "Initial setup",
    /** Eyebrow on the server setup page */
    setup: "Setup",
  },

  // ── Navigation ─────────────────────────────────────────────────────
  nav: {
    chats: "Chats",
    storage: "Files",
    plans: "Plans",

    settings: "Settings",
    admin: "Admin",
    logOut: "Log out",
    /** aria-label for the nav element */
    ariaLabel: "Application navigation",
    unreadMessages: (count: number) => `${count} unread messages`,
  },

  // ── Auth — Login ────────────────────────────────────────────────────
  auth: {
    nickname: "Nickname",
    password: "Password",
    logIn: "Log in",
    signingIn: "Signing in",
    newServer: "New server?",
    createOwnerAccount: "Create owner account",
    changeServerAddress: "Change server address",
    showPassword: "Show password",
    hidePassword: "Hide password",
    verificationCode: "Verification code",
    sendCodeToArchive: "Send code to Message Archive",
    sending: "Sending…",
    verifyAndLogIn: "Verify and log in",
    verifying: "Verifying…",
    deviceCodeHint:
      "Open Message Archive on a device where you are already signed in. The code is valid for 10 minutes.",
  },

  // ── Auth — Setup (owner account creation) ──────────────────────────
  setup: {
    createOwnerAccount: "Create owner account",
    creating: "Creating",
    alreadySetUp: "Already set up?",
    logIn: "Log in",
    changeServerAddress: "Change server address",
  },

  // ── Auth — Invite ───────────────────────────────────────────────────
  invite: {
    role: "Role",
    usesLeft: "Uses left",
    expires: "Expires",
    openInApp: "Open in Stovo App",
    orContinueInBrowser: "or continue in browser",
    joinFamily: "Join family",
    joining: "Joining",
  },

  // ── Server setup ────────────────────────────────────────────────────
  serverSetup: {
    title: "Server address",
    hint: "Enter the address of your Stovo server. Use",
    hintHttps: "https://",
    hintSuffix: "for domain names.",
    serverUrl: "Server URL",
    placeholder: "https://stovo.example.com",
    connect: "Connect",
    testingConnection: "Testing connection…",
    localNetworkHint: "For local network:",
    localNetworkExample: "http://192.168.1.100:8000",
  },

  // ── Settings — Navigation labels ───────────────────────────────────
  settings: {
    title: "Settings",
    yourSpace: "Your space",
    yourData: "Your data",

    // sidebar items
    appearance: "Appearance",
    appearanceHelper: "Theme, accent, and chat look",
    notifications: "Notifications",
    notificationsHelper: "Messages, calls, and quiet hours",
    privacyAndSecurity: "Privacy and Security",
    privacyHelper: "Profile visibility and read receipts",
    language: "Language",
    languageHelper: "App language and translation",
    languageSystem: "System default (Auto)",
    languageSystemSubtext: (current: string) => `Matches device language (${current})`,
    languageEnglish: "English",
    languageRussian: "Русский",
    helpAndAbout: "Help and About",
    helpHelper: "Version and support",


    changeServerAddress: "Change server address",
    tapToPersonalize: "Tap to personalize",

    // profile card
    familyMember: "Family member",
    openProfileSettings: "Open profile settings",
    changeProfilePhoto: "Change profile photo",

    // profile form
    avatarDisplayName: "Avatar display name",
    familySpaceName: "Family space name",
    saveProfile: "Save profile",
    saving: "Saving",
    profileSaved: "Profile saved",
    profilePhotoUpdated: "Profile photo updated",

    // profile detail form
    displayName: "Display name",
    emailOptional: "Email (optional)",
    emailPlaceholder: "e.g. alex@example.com",
    bioOptional: "Bio (optional)",
    bioPlaceholder: "Tell family members a bit about yourself…",
    timezone: "Timezone",
    family: "Family",
    login: "Login",
    server: "Server",

    // password change
    changePassword: "Change password",
    changePasswordNote: "This applies only to the account on the currently selected server.",
    currentPassword: "Current password",
    newPassword: "New password",
    confirmNewPassword: "Confirm new password",
    changing: "Changing…",
    passwordChanged: "Password changed. Other devices have been signed out.",

    // android connection
    connectAndroidDevice: "Connect Android device",
    androidLinkNote:
      "The link contains no password. On the new device, request a code delivered to Message Archive on this signed-in account.",
    androidLink: "Android link",
    copyConnectionLink: "Copy connection link",
    connectionLinkCopied:
      "Connection link copied. The sign-in code will arrive in Message Archive.",

    // close panel
    closeSettingsPanel: "Close settings panel",
    backToSettings: "Back to settings",

    // family members list
    familySpaceNote: "Your shared family space. Calendar permissions follow each member's role.",
    familyInviteNote:
      "Invitation and role management remains available here as the Family controls expand.",

    // generic placeholder
    sectionComingSoon: "This area is ready for Stovo controls as they are added.",

    logOut: "Log out",
    savingEllipsis: "Saving…",
  },

  // ── Appearance editor ───────────────────────────────────────────────
  appearance: {
    title: "Appearance",
    backToSettings: "Back to settings",

    // section labels
    theme: "Theme",
    accentColour: "Accent colour",
    chatBackground: "Chat background",
    messageStyle: "Message style",
    chatMedia: "Chat media",

    // wallpaper
    photo: "Photo",
    upload: "Upload",
    uploadImage: "Upload image",
    uploading: "Uploading…",
    removeCustom: "Remove custom",

    // message style controls
    curvature: "Curvature",
    messageSize: "Message size",
    bubbleShapePresetsAria: "Bubble shape presets",
    messageFontAria: "Message font",
    densityAria: "Density",
    bubbleCurvatureAria: "Message bubble curvature",

    // toggles
    videoAutoplay: "Video autoplay",
    videoAutoplayHelp: "Muted inline preview like Telegram",
    renderMarkdown: "Render markdown",
    renderMarkdownHelp: "Bold, italic, links, code, and more",
    enterToSend: "Enter to send",
    enterToSendHelp:
      "On: Enter sends, Shift+Enter adds a new line. Off: Enter adds a new line, Ctrl/Cmd+Enter sends",

    // preview aria
    themePreviewAria: "Theme preview",
    themeModeAria: "Theme mode",
    accentColourAria: "Accent colour",
    chatBackgroundAria: "Chat background",

    // accent labels
    customColor: "Custom color",
    customAccentAria: "Custom accent color",
    accentSuffix: "accent",

    // reset dialog
    resetAppearance: "Reset appearance",
    resetAllSettings: "Reset all appearance settings?",
    resetNote: "Your theme, accent, wallpaper, and chat display options will return to Stovo defaults.",
    keepMyTheme: "Keep my theme",
    reset: "Reset",

    done: "Done",

    // preview chat bubbles (used in live preview hero)
    previewBubble1: "Family dinner is at 7.",
    previewBubble2: "I will bring dessert.",
  },

  // ── Notifications settings ──────────────────────────────────────────
  notifications: {
    messages: "Messages",
    calls: "Calls",
    quietHours: "Quiet hours",
    messageNotifications: "Message notifications",
    messagePreview: "Message preview",
    messageSound: "Sound",
    callNotifications: "Call notifications",
    ringtoneEnabled: "Ringtone",
    muteNotifications: "Mute notifications",
    start: "Start",
    end: "End",
    quietHoursStartAria: "Quiet hours start",
    quietHoursEndAria: "Quiet hours end",
  },

  // ── Privacy & Security ──────────────────────────────────────────────
  privacy: {
    profileVisibility: "Profile visibility",
    lastSeen: "Last seen",
    readReceipts: "Read receipts",
    readReceiptsHelp: "Let people know when you have read their messages",
    appLock: "App lock",
    appLockOn: "On",
    appLockOff: "Off",
    blockedMembers: "Blocked members",
    nobody: "Nobody",
    family: "Family",
    visibleToFamily: "Visible to everyone in your family",
    hiddenFromMembers: "Hidden from other members",
    block: "Block",
    unblock: "Unblock",
    confirmEnableAppLock: "Confirm to enable App lock",
    confirmDisableAppLock: "Confirm to disable App lock",
  },

  // ── Error messages ──────────────────────────────────────────────────
  errors: {
    invalidCredentials: "Invalid credentials",
    couldNotSendCode: "Could not send verification code",
    invalidVerificationCode: "Invalid verification code",
    setupFailed: "Setup failed",
    inviteUnavailable: "Invite is unavailable",
    inviteAcceptanceFailed: "Invite acceptance failed",
    couldNotLoadSettings: "Could not load settings",
    couldNotSaveProfile: "Could not save profile",
    couldNotUpdateProfilePhoto: "Could not update profile photo",
    couldNotChangePassword: "Could not change password",
    couldNotUpdatePrivacySettings: "Could not update privacy settings",
    couldNotUpdateBlockedMembers: "Could not update blocked members",
    couldNotUploadWallpaper: "Could not upload wallpaper",
    couldNotUpdateAppLock: "Could not update App lock",
    wallpaperMustBeImage: "Choose an image file (JPEG, PNG, GIF, or WebP).",
    passwordMismatch: "New password and confirmation do not match",
    pinRequired:
      "Set a device PIN, pattern, password, or biometric in Android settings first.",
  },

  // ── Chats ────────────────────────────────────────────────────────────
  chats: {
    title: "Chats",
    searchPlaceholder: "Search messages or members",
    filters: {
      all: "All",
      unread: "Unread",
      groups: "Groups",
      direct: "Direct",
      voice: "Voice",
      muted: "Muted",
    },
    sections: {
      archive: "Message Archive",
      voice: "Voice Channels",
      channels: "Channels",
      groups: "Groups",
      dms: "DMs",
    },
    types: {
      familyChat: "Family chat",
      voiceChannel: "Voice channel",
      channel: "Channel",
      groupChat: "Group chat",
      directChat: "Direct chat",
      generalFamilyChat: "General Family Chat",
      directMessage: "Direct message",
      messageArchive: "Message Archive",
      membersCount: (count: number) => `${count} member${count === 1 ? "" : "s"}`,
      inVoice: (count: number) => `${count} in voice / Voice Channel`,
      privateFamilyRoom: (count: number) => `${count} members / private family room`,
      readOnlyChannel: (count: number) => `${count} members / read-only channel`,
      groupChatPreview: (count: number) => `${count} members / group chat`,
    },
    details: {
      title: "Chat details",
      settings: "Chat settings",
      name: "Chat name",
      save: "Save",
      cancel: "Cancel",
      message: "Message",
      mute: "Mute",
      unmute: "Unmute",
      favorite: "Favorite",
      saved: "Saved",
      wallpaper: "Chat wallpaper",
      uploadPhoto: "Upload photo",
      changePhoto: "Change photo",
      remove: "Remove",
      familyStorage: "Family storage",
      familyStorageHelp: "Show media in shared family storage",
      comments: "Comments",
      commentsHelp: "Allow members to comment on posts",
      whoCanPin: "Who can pin messages",
      everyone: "Everyone",
      adminsOnly: "Admins only",
      messageDelay: "Message delay",
      off: "Off",
      members: "Members",
      tabs: {
        media: "Media",
        audio: "Audio",
        files: "Files",
        links: "Links",
      },
      empty: {
        media: "No media yet",
        audio: "No audio yet",
        files: "No files yet",
        links: "No links yet",
      },
      email: "Email",
      timezone: "Timezone",
      saveToArchive: "Save to Message Archive",
      savedToArchiveNotice: "Saved to Message Archive",
      editChatName: "Edit chat name",
      changeChatPhoto: "Change chat photo",
      backToChat: "Back to chat",
    },
    newChat: {
      title: "New chat",
      newGroup: "New group",
      newChannel: "New channel",
      newVoiceChannel: "New voice channel",
      directMessage: "Direct message",
      directMessageHint: "Chat 1-on-1 with a family member",
      groupHint: "Private chat with selected members",
      channelHint: "Broadcast channel with admin posts",
      groupTitlePlaceholder: "Group name",
      channelTitlePlaceholder: "Channel name",
      voiceChannelTitlePlaceholder: "Voice channel name",
      create: "Create",
      creating: "Creating…",
    },
  },

  // ── Files / Storage ──────────────────────────────────────────────────
  files: {
    title: "Files",
    searchPlaceholder: "Search files",
    uploadFile: "Upload file",
    uploading: "Uploading…",
    allChats: "All chats",
    storageSource: "Storage source",
    storageFilters: "Storage filters",
    filters: {
      all: "All",
      photos: "Photos",
      videos: "Videos",
      audio: "Audio",
      documents: "Documents",
      favorites: "Favorites",
    },
    categories: {
      archive: "MESSAGE ARCHIVE",
      voice: "VOICE CHANNELS",
      family: "FAMILY CHATS",
      groups: "GROUPS",
      channels: "CHANNELS",
      direct: "DIRECT CHATS",
    },
    empty: "No files found",
    noFilesInFilter: "No files in this filter",
    download: "Download",
    delete: "Delete",
    favorite: "Favorite",
    removeFavorite: "Remove favorite",
    openInChat: "Open in chat",
    familyStorage: "Family storage",
    chatMembers: "Chat members",
  },

  // ── Plans ────────────────────────────────────────────────────────────
  plans: {
    title: "Plans",
    searchPlaceholder: "Find a plan",
    today: "Today",
    thisWeek: "This week",
    month: "Month",
    upcoming: "Upcoming",
    noPlansRange: "No plans in this range.",
    noPlansYet: "No plans yet",
    loadingPlans: "Loading plans…",
    createPlan: "Create plan",
    newPlan: "New plan",
    planTitle: "Title",
    starts: "Starts",
    ends: "Ends",
    allDay: "All day",
    location: "Location",
    locationOptional: "Location (optional)",
    descriptionOrLink: "Description / Link",
    descriptionPlaceholder: "Add notes or video call link (e.g. https://...)",
    going: "Going",
    maybe: "Maybe",
    goingCount: (count: number) => `${count} going`,
    openChat: "Open chat",
    close: "Close",
  },

  // ── Admin ────────────────────────────────────────────────────────────
  admin: {
    title: "Admin",
    adminAccessRequired: "Admin access required.",
    backToAdmin: "Back to Admin",
    hub: {
      appearance: "Appearance",
      appearanceDesc: "Shared chat-list layout for all frontends",
      encryption: "Message encryption",
      encryptionDesc: "Default protocol for new chats",
      mcp: "MCP connectors",
      mcpDesc: "Claude Code, Codex, OpenClaw, Hermes",
      members: "Members",
      membersDesc: "Family members, roles, and account actions",
    },
    appearance: {
      title: "Appearance",
      chatLayout: "Chat list layout",
      chatLayoutDesc: "Shared chat-list layout for all frontends",
      minimizedLayout: "Minimized layout",
      minimizedLayoutDesc: "Single-line chat items with compact badges",
      saved: "Chat layout saved for everyone",
    },
    encryption: {
      title: "Message encryption",
      protocol: "Message encryption protocol",
      protocolDesc: "Choose the default encryption mode for new chats in your family space.",
      serverAtRest: "Server encryption at rest (default)",
      serverAtRestDesc: "Stored encrypted on server disks, readable across devices seamlessly.",
      e2ee: "End-to-end encryption",
      e2eeDesc: "Only devices holding private encryption keys can decrypt messages.",
      save: "Save encryption settings",
      saved: "Encryption settings saved",
    },
    mcp: {
      title: "MCP connectors",
      description: "Manage Model Context Protocol connectors for AI assistants.",
    },
    members: {
      title: "Members",
      description: "Family members, roles, and account actions",
      inviteMember: "Invite member",
      roleOwner: "Owner",
      roleAdmin: "Admin",
      roleAdult: "Adult",
      roleChild: "Child",
      removeMember: "Remove member",
    },
  },

  // ── Invite Modal ─────────────────────────────────────────────────────
  inviteModal: {
    title: (familyName: string) => `Invite to ${familyName}`,
    close: "Close invite dialog",
    creating: "Creating invite…",
    qrCode: "QR code",
    qrAlt: "Invite QR code",
    generatingQr: "Generating QR…",
    copy: "Copy",
    copied: "Copied",
    share: "Share",
    inviteLink: "Invite link",
    shareTitle: (familyName: string) => `Join ${familyName} on Stovo`,
    shareText: (familyName: string) => `Join our family "${familyName}" on Stovo!`,
    shareDialogTitle: (familyName: string) => `Invite to ${familyName}`,
  },

  // ── Message Context Menu ─────────────────────────────────────────────
  contextMenu: {
    react: (emoji: string) => `React with ${emoji}`,
    moreReactions: "More reactions",
    hideMoreReactions: "Hide more reactions",
    comment: "Comment",
    reply: "Reply",
    copy: "Copy",
    pinMessage: "Pin message",
    unpinMessage: "Unpin message",
    forward: "Forward",
    saveToArchive: "Save to Message Archive",
    edit: "Edit",
    delete: "Delete",
    seenBy: "Seen by",
    noReaders: "No readers yet",
  },
} as const;



type DeepStringRecord<T> = {
  readonly [K in keyof T]: T[K] extends (...args: any[]) => any
    ? T[K]
    : T[K] extends object
      ? DeepStringRecord<T[K]>
      : string;
};

export type AppStrings = DeepStringRecord<typeof strings>;
