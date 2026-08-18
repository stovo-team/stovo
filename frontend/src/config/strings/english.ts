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
    storage: "Storage",
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
} as const;

export type AppStrings = typeof strings;
