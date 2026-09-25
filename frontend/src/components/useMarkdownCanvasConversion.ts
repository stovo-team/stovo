import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { createCanvas, encodeMarkdownCanvasDocumentUpdate } from "../api/canvas";
import { getClusterPrefix } from "../api/client";
import { getChats } from "../api/chats";
import type { FamilyFile } from "../api/files";

function markdownCanvasTitle(fileName: string) {
  return fileName.replace(/\.(?:md|markdown)$/iu, "").trim() || "Untitled Canvas";
}

export function useMarkdownCanvasConversion({
  accessToken,
  file,
  markdown,
}: {
  accessToken: string;
  file: FamilyFile;
  markdown: string | null;
}) {
  const [isConverting, setIsConverting] = useState(false);
  const [isLoadingChatChoices, setIsLoadingChatChoices] = useState(false);
  const [conversionError, setConversionError] = useState<string | null>(null);
  const [createdCanvasId, setCreatedCanvasId] = useState<string | null>(null);
  const [chatChoices, setChatChoices] = useState<Array<{ id: string; title: string | null }> | null>(null);
  const [chosenChatId, setChosenChatId] = useState("");
  const conversionInFlight = useRef(false);
  const navigate = useNavigate();

  const convertToCanvas = async () => {
    if (conversionInFlight.current) return;
    if (!accessToken || markdown === null) {
      setConversionError("Sign in and load the Markdown file before converting it to Canvas.");
      return;
    }
    if (!file.chatId && !chosenChatId) {
      setIsLoadingChatChoices(true);
      setConversionError(null);
      try {
        const chats = await getChats(accessToken);
        setChatChoices(chats.map(({ id, title }) => ({ id, title })));
        if (chats.length === 0) setConversionError("Create or join a chat before converting this file to Canvas.");
      } catch (cause) {
        setConversionError(cause instanceof Error ? cause.message : "Could not load chats for Canvas.");
      } finally {
        setIsLoadingChatChoices(false);
      }
      return;
    }
    const destinationChatId = file.chatId ?? chosenChatId;
    conversionInFlight.current = true;
    setIsConverting(true);
    setConversionError(null);
    let requestCanvasId: string | null = null;
    try {
      const update = encodeMarkdownCanvasDocumentUpdate(markdown);
      const canvas = await createCanvas(accessToken, destinationChatId, markdownCanvasTitle(file.originalName), update);
      requestCanvasId = canvas.id;
      setCreatedCanvasId(canvas.id);
      navigate(`${getClusterPrefix()}/app/canvas/${encodeURIComponent(canvas.id)}`);
    } catch (cause) {
      setConversionError(requestCanvasId
        ? "The Canvas was created, but its Markdown import could not be confirmed. Open it to inspect or continue editing."
        : cause instanceof Error ? cause.message : "Could not create Canvas.");
      conversionInFlight.current = false;
      setIsConverting(false);
      return;
    }
    conversionInFlight.current = false;
    setIsConverting(false);
  };

  const openCreatedCanvas = () => {
    if (createdCanvasId) navigate(`${getClusterPrefix()}/app/canvas/${encodeURIComponent(createdCanvasId)}`);
  };

  return {
    isConverting,
    isLoadingChatChoices,
    conversionError,
    createdCanvasId,
    chatChoices,
    chosenChatId,
    setChosenChatId,
    convertToCanvas,
    openCreatedCanvas,
  };
}
