export type ChatTransferStrings = {
  transferSectionTitle: string;
  importAction: string;
  exportAction: string;
  importTitle: string;
  exportTitle: string;
  importHelp: string;
  exportHelp: string;
  chooseFile: string;
  chooseFileButton: string;
  noFileChosen: string;
  filesSelected: (count: number) => string;
  reviewExport: string;
  downloadExport: string;
  importAsNewChat: string;
  cancel: string;
  importing: string;
  exporting: string;
  messages: (count: number) => string;
  participants: (count: number) => string;
  attachments: (count: number) => string;
  dateRange: string;
  warnings: string;
  knownLosses: string;
  compatibility: string;
  stovoRoundTrip: string;
  providerArchive: string;
  nativeVerified: string;
  noMessages: string;
  plaintextWarning: string;
  imported: string;
  selectProvider: string;
  error: string;
  originalAuthor: (name: string) => string;
  importedFrom: (provider: string) => string;
  attributionLabel: (author: string, provider: string) => string;
  multipleChatsUnsupported: string;
};

const english: ChatTransferStrings = {
  transferSectionTitle: "Import and export",
  importAction: "Import chat from file",
  exportAction: "Export chat",
  importTitle: "Import chat from file",
  exportTitle: "Export chat",
  importHelp: "Choose a provider export for one chat. The file is parsed on this device.",
  exportHelp: "Choose a format for this chat. Provider archives may omit unsupported fields.",
  chooseFile: "Choose chat export file",
  chooseFileButton: "Choose file",
  noFileChosen: "No file chosen",
  filesSelected: (count) => `${count} files selected`,
  reviewExport: "Review export",
  downloadExport: "Download export",
  importAsNewChat: "Import as new chat",
  cancel: "Cancel",
  importing: "Importing chat…",
  exporting: "Preparing export…",
  messages: (count) => `${count} message${count === 1 ? "" : "s"}`,
  participants: (count) => `${count} participant${count === 1 ? "" : "s"}`,
  attachments: (count) => `${count} attachment${count === 1 ? "" : "s"}`,
  dateRange: "Date range",
  warnings: "Import notes",
  knownLosses: "Known losses",
  compatibility: "Compatibility",
  stovoRoundTrip: "Stovo round trip",
  providerArchive: "Readable provider archive; native import is not verified",
  nativeVerified: "Native import verified",
  noMessages: "No messages",
  plaintextWarning: "This export may contain plaintext. End-to-end encrypted messages are decrypted on this device before the file is created.",
  imported: "Chat imported",
  selectProvider: "Export format",
  error: "Could not process this chat export. Check the file and try again.",
  originalAuthor: (name) => `Original author: ${name}`,
  importedFrom: (provider) => `Imported from ${provider}`,
  attributionLabel: (author, provider) => `Original author: ${author} · Imported from ${provider}`,
  multipleChatsUnsupported: "This file contains multiple chats. Choose a one-chat export; whole-space imports are planned for V2."
};

const russian: ChatTransferStrings = {
  transferSectionTitle: "Импорт и экспорт",
  importAction: "Импортировать чат из файла",
  exportAction: "Экспортировать чат",
  importTitle: "Импорт чата из файла",
  exportTitle: "Экспорт чата",
  importHelp: "Выберите файл экспорта одного чата. Файл обрабатывается на этом устройстве.",
  exportHelp: "Выберите формат для этого чата. Форматы провайдеров могут не содержать часть данных.",
  chooseFile: "Выбрать файл экспорта чата",
  chooseFileButton: "Выбрать файл",
  noFileChosen: "Файл не выбран",
  filesSelected: (count) => `Выбрано файлов: ${count}`,
  reviewExport: "Просмотреть экспорт",
  downloadExport: "Скачать экспорт",
  importAsNewChat: "Импортировать как новый чат",
  cancel: "Отмена",
  importing: "Импорт чата…",
  exporting: "Подготовка экспорта…",
  messages: (count) => `${count} сообщ.`,
  participants: (count) => `${count} участн.`,
  attachments: (count) => `${count} влож.`,
  dateRange: "Период",
  warnings: "Примечания к импорту",
  knownLosses: "Возможные потери",
  compatibility: "Совместимость",
  stovoRoundTrip: "Полный цикл Stovo",
  providerArchive: "Архив для чтения; импорт в провайдера не проверен",
  nativeVerified: "Импорт в провайдера проверен",
  noMessages: "Нет сообщений",
  plaintextWarning: "Экспорт может содержать открытый текст. Сообщения со сквозным шифрованием расшифровываются на этом устройстве перед созданием файла.",
  imported: "Чат импортирован",
  selectProvider: "Формат экспорта",
  error: "Не удалось обработать экспорт чата. Проверьте файл и попробуйте снова.",
  originalAuthor: (name) => `Исходный автор: ${name}`,
  importedFrom: (provider) => `Импортировано из ${provider}`,
  attributionLabel: (author, provider) => `Исходный автор: ${author} · импортировано из ${provider}`,
  multipleChatsUnsupported: "В файле несколько чатов. Выберите экспорт одного чата; импорт всего пространства запланирован на V2."
};

export function getChatTransferStrings(language: "en" | "ru"): ChatTransferStrings {
  return language === "ru" ? russian : english;
}
