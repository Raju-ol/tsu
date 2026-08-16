"use client";

import { use, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import EmojiPicker, { EmojiClickData, Theme } from "emoji-picker-react";
import { useSwipeable } from "react-swipeable";
import { getColorById, getFirstInitial } from "@/lib/avatars";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useTheme } from "@/lib/theme";
import {
  ArrowLeft,
  Copy,
  Check,
  Trash2,
  Eye,
  EyeOff,
  Smile,
  Send,
  MoreVertical,
  Menu,
  Users,
  AlertTriangle,
  MessageSquareDashed,
  CornerDownRight,
  UserX,
  Flag,
  RotateCcw,
} from "lucide-react";

interface PageProps {
  params: Promise<{ code: string }>;
}

interface ReplyData {
  id: string;
  nickname: string;
  messageSnippet: string;
}

interface RoomUserData {
  nickname: string;
  avatarId: number;
  colorId: string;
}

interface MessageItem {
  id: string;
  type: "chat" | "system";
  nickname?: string;
  avatarId?: number;
  colorId?: string;
  message: string;
  replyTo?: ReplyData;
  timestamp?: string;
  isDeleted?: boolean;
}

const REPORT_REASONS = [
  "Spam",
  "Harassment",
  "Threat",
  "Illegal content",
  "Other",
];

const SESSION_PREFIX = "tsu-session-";

// Swipeable wrapper component for Touch/Mobile swipe-to-reply
function SwipeableMessageItem({
  msg,
  onReply,
  children,
}: {
  msg: MessageItem;
  onReply: (msg: MessageItem) => void;
  children: React.ReactNode;
}) {
  const [offsetX, setOffsetX] = useState(0);

  const handlers = useSwipeable({
    onSwiping: (eventData) => {
      if (eventData.dir === "Right" && msg.type === "chat" && !msg.isDeleted) {
        setOffsetX(Math.min(eventData.deltaX, 60));
      }
    },
    onSwipedRight: (eventData) => {
      if (eventData.deltaX >= 40 && msg.type === "chat" && !msg.isDeleted) {
        onReply(msg);
      }
      setOffsetX(0);
    },
    onSwiped: () => {
      setOffsetX(0);
    },
    trackMouse: false,
    preventScrollOnSwipe: false,
    delta: 10,
  });

  if (msg.type === "system" || msg.isDeleted) {
    return <>{children}</>;
  }

  return (
    <div {...handlers} className="relative touch-pan-y">
      {/* Visual Reply Cue Icon behind bubble */}
      <div
        className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-7 h-7 rounded-full bg-[#128c7e]/20 dark:bg-[#25d366]/20 text-[#128c7e] dark:text-[#25d366] transition-opacity duration-150 pointer-events-none z-0"
        style={{
          opacity: Math.min(offsetX / 40, 1),
          transform: `translateY(-50%) scale(${Math.min(offsetX / 40, 1)})`,
        }}
      >
        <CornerDownRight className="w-3.5 h-3.5" />
      </div>

      {/* Swipable Message Content */}
      <div
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: offsetX === 0 ? "transform 0.2s ease-out" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default function RoomPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const code = resolvedParams.code ? resolvedParams.code.toUpperCase() : "";
  const searchParams = useSearchParams();
  const router = useRouter();

  const { theme, toggleTheme } = useTheme();

  const queryName = searchParams.get("name") || "";

  const [name, setName] = useState<string>(queryName);
  const [roomName, setRoomName] = useState<string | undefined>(undefined);
  const [colorId, setColorId] = useState<string>("amber");

  const [hasJoined, setHasJoined] = useState<boolean>(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Chat & Real-Time State
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputMessage, setInputMessage] = useState<string>("");
  const [onlineUsers, setOnlineUsers] = useState<RoomUserData[]>([]);
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Mobile Drawer Menu State
  const [showMobileDrawer, setShowMobileDrawer] = useState<boolean>(false);

  // Delete & Bulk Delete State
  const [deleteConfirmMessageId, setDeleteConfirmMessageId] = useState<string | null>(null);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState<boolean>(false);
  const [showClearMyMessagesModal, setShowClearMyMessagesModal] = useState<boolean>(false);
  const [localClearedMyMessages, setLocalClearedMyMessages] = useState<boolean>(false);

  // Reply & Emoji State
  const [replyingTo, setReplyingTo] = useState<ReplyData | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState<boolean>(false);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);

  // Click-to-Filter & Hide State
  const [filterNickname, setFilterNickname] = useState<string | null>(null);
  const [hiddenUsers, setHiddenUsers] = useState<string[]>([]);

  // Block & Report State
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const [activeMenuMessageId, setActiveMenuMessageId] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{
    nickname: string;
    messageText?: string;
  } | null>(null);
  const [selectedReason, setSelectedReason] = useState<string>("Spam");
  const [submittingReport, setSubmittingReport] = useState<boolean>(false);
  const [reportToast, setReportToast] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto-scroll to bottom of message list
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Validate Room & Check Session Storage on Mount
  useEffect(() => {
    let isMounted = true;

    async function validateRoom() {
      if (!code) {
        if (isMounted) {
          setIsValid(false);
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        const res = await fetch(`/api/rooms/${code}`);
        const data = await res.json();

        if (isMounted) {
          const roomValid = res.ok && data.valid === true;
          setIsValid(roomValid);
          if (data.name) {
            setRoomName(data.name);
          }

          if (roomValid) {
            // Check sessionStorage for existing active session in this room tab
            const stored = sessionStorage.getItem(`${SESSION_PREFIX}${code}`);
            if (stored) {
              try {
                const parsed = JSON.parse(stored);
                if (parsed.nickname) {
                  setName(parsed.nickname);
                  setHasJoined(true);
                }
              } catch {
                // Ignore parse error
              }
            } else if (queryName) {
              // Coming directly from /create or /join with query params
              const sessionObj = {
                roomCode: code,
                nickname: queryName.trim(),
              };
              sessionStorage.setItem(`${SESSION_PREFIX}${code}`, JSON.stringify(sessionObj));
              setHasJoined(true);
            }
          }
        }
      } catch {
        if (isMounted) {
          setIsValid(false);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    validateRoom();

    return () => {
      isMounted = false;
    };
  }, [code, queryName]);

  // Connect to Socket.io once user joins chat
  useEffect(() => {
    if (!isValid || !hasJoined) return;

    setJoinError(null);

    const socket = io();
    socketRef.current = socket;

    const userNickname = name.trim() || "Anonymous";

    socket.on("connect", () => {
      console.log("[Client] Connected to socket server:", socket.id);
      socket.emit("join-room", {
        roomCode: code,
        nickname: userNickname,
      });
    });

    socket.on("identity-assigned", (data: { colorId: string }) => {
      if (data.colorId) {
        setColorId(data.colorId);
      }
    });

    socket.on("nickname-taken", (data: { message: string }) => {
      setJoinError(data.message || "That name is already in use in this room, please choose another.");
      setHasJoined(false);
      sessionStorage.removeItem(`${SESSION_PREFIX}${code}`);
      socket.disconnect();
    });

    socket.on("new-message", (msg: MessageItem) => {
      setMessages((prev) => [...prev, { ...msg, type: "chat" }]);
    });

    socket.on("message-deleted", (data: { messageId: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.messageId
            ? { ...m, isDeleted: true, message: "This message was deleted" }
            : m
        )
      );
    });

    socket.on("bulk-messages-deleted", (data: { deletedIds: string[] }) => {
      setMessages((prev) =>
        prev.map((m) =>
          data.deletedIds.includes(m.id)
            ? { ...m, isDeleted: true, message: "This message was deleted" }
            : m
        )
      );
    });

    socket.on("user-joined", (data: { nickname: string }) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `system-${Date.now()}-${Math.random()}`,
          type: "system",
          message: `${data.nickname} joined the room`,
        },
      ]);
    });

    socket.on("user-left", (data: { nickname: string }) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `system-${Date.now()}-${Math.random()}`,
          type: "system",
          message: `${data.nickname} left the room`,
        },
      ]);
    });

    socket.on("room-users", (data: { users: RoomUserData[] }) => {
      setOnlineUsers(data.users || []);
    });

    socket.on("rate-limit-error", (data: { message: string }) => {
      setRateLimitError(data.message || "You're sending messages too fast");
      setTimeout(() => {
        setRateLimitError(null);
      }, 3500);
    });

    socket.on("room-error", (data: { message: string }) => {
      alert(data.message || "Room error");
      setIsValid(false);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isValid, hasJoined, code, name]);

  const handleJoinChatClick = () => {
    const userNickname = name.trim() || "Anonymous";
    const sessionObj = {
      roomCode: code,
      nickname: userNickname,
    };
    sessionStorage.setItem(`${SESSION_PREFIX}${code}`, JSON.stringify(sessionObj));
    setHasJoined(true);
  };

  const handleLeaveRoom = () => {
    sessionStorage.removeItem(`${SESSION_PREFIX}${code}`);
    router.push("/");
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || inputMessage.length > 1000 || !socketRef.current) return;

    const userNickname = name.trim() || "Anonymous";
    socketRef.current.emit("send-message", {
      roomCode: code,
      message: inputMessage.trim(),
      nickname: userNickname,
      replyTo: replyingTo
        ? {
            id: replyingTo.id,
            nickname: replyingTo.nickname,
            messageSnippet: replyingTo.messageSnippet,
          }
        : undefined,
    });

    setInputMessage("");
    setReplyingTo(null);
    setShowEmojiPicker(false);
  };

  // Delete message for everyone
  const handleConfirmDeleteMessage = () => {
    if (!deleteConfirmMessageId || !socketRef.current) return;
    socketRef.current.emit("delete-message", {
      roomCode: code,
      messageId: deleteConfirmMessageId,
    });
    setDeleteConfirmMessageId(null);
    setActiveMenuMessageId(null);
  };

  // Bulk Delete ALL my messages
  const handleConfirmDeleteAllMessages = () => {
    if (!socketRef.current) return;
    socketRef.current.emit("delete-all-my-messages", {
      roomCode: code,
    });
    setShowDeleteAllModal(false);
    setShowMobileDrawer(false);
  };

  // Clear my sent messages (Local view only)
  const handleConfirmClearMyMessages = () => {
    setLocalClearedMyMessages(true);
    setShowClearMyMessagesModal(false);
    setShowMobileDrawer(false);
  };

  const handleCopyLink = async () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const fullUrl = `${origin}/r/${code}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore
    }
  };

  // Initiate reply to a message
  const handleInitiateReply = (msg: MessageItem) => {
    if (!msg.nickname || msg.type === "system" || msg.isDeleted) return;
    const snippet = msg.message.slice(0, 40) + (msg.message.length > 40 ? "..." : "");
    setReplyingTo({
      id: msg.id,
      nickname: msg.nickname,
      messageSnippet: snippet,
    });
    setActiveMenuMessageId(null);
    inputRef.current?.focus();
  };

  // Scroll to original message when quote is clicked
  const handleScrollToOriginalMessage = (targetId: string) => {
    const el = document.getElementById(targetId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedMsgId(targetId);
      setTimeout(() => setHighlightedMsgId(null), 2000);
    }
  };

  // Handle Emoji Selection
  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setInputMessage((prev) => prev + emojiData.emoji);
  };

  // Sidebar Hide/Unhide Handlers
  const handleToggleHideUser = (nicknameToHide: string) => {
    const cleanName = nicknameToHide.toLowerCase();
    setHiddenUsers((prev) =>
      prev.includes(cleanName)
        ? prev.filter((n) => n !== cleanName)
        : [...prev, cleanName]
    );
  };

  // Block Handler
  const handleBlockUser = (nicknameToBlock: string) => {
    const cleanName = nicknameToBlock.toLowerCase();
    if (!blockedUsers.includes(cleanName)) {
      setBlockedUsers((prev) => [...prev, cleanName]);
    }
    setActiveMenuMessageId(null);
  };

  // Unblock Handler
  const handleUnblockUser = (nicknameToUnblock: string) => {
    setBlockedUsers((prev) => prev.filter((name) => name !== nicknameToUnblock));
  };

  // Report Form Handler
  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportTarget) return;

    try {
      setSubmittingReport(true);
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomCode: code,
          reportedNickname: reportTarget.nickname,
          reason: selectedReason,
          messageText: reportTarget.messageText,
          timestamp: new Date().toLocaleString(),
        }),
      });

      if (res.ok) {
        setReportToast("Report submitted. Thank you.");
        setTimeout(() => setReportToast(null), 3500);
      }
    } catch {
      // Ignore
    } finally {
      setSubmittingReport(false);
      setReportTarget(null);
      setActiveMenuMessageId(null);
    }
  };

  // 1. Loading State
  if (loading) {
    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-center p-4 dark:bg-[#0f0f11] bg-[#fafafa] dark:text-zinc-100 text-zinc-900 font-sans">
        <div className="flex flex-col items-center space-y-3 text-center">
          <div className="w-6 h-6 rounded-full border-2 border-[#128c7e] dark:border-[#25d366] border-t-transparent animate-spin" />
          <p className="text-xs font-mono dark:text-zinc-400 text-zinc-500">Validating room...</p>
        </div>
      </main>
    );
  }

  // 2. Invalid or Expired Room Error State
  if (!isValid) {
    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-between p-4 sm:p-12 dark:bg-[#0f0f11] bg-[#fafafa] dark:text-zinc-100 text-zinc-900 font-sans overflow-x-hidden">
        <div className="w-full max-w-sm flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs dark:text-zinc-400 text-zinc-600 hover:dark:text-zinc-200 transition-colors font-medium py-1"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Link>
          <ThemeToggle />
        </div>

        <div className="w-full max-w-sm my-auto py-4">
          <div className="p-6 sm:p-8 rounded-2xl dark:bg-[#18181b] bg-white border dark:border-zinc-800 border-zinc-200 text-center space-y-5">
            <div className="space-y-2">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight dark:text-white text-zinc-950">
                Room expired or invalid
              </h1>
              <p className="text-xs dark:text-zinc-400 text-zinc-600">
                Rooms automatically expire 60 minutes after creation.
              </p>
            </div>
            <div className="space-y-2 pt-2">
              <Link
                href="/create"
                className="block w-full py-2.5 px-4 rounded-xl font-medium text-white dark:text-[#0b1210] dark:font-bold bg-[#128c7e] hover:bg-[#0f766a] dark:bg-[#25d366] hover:dark:bg-[#20bd5a] transition-colors duration-150 text-center text-sm"
              >
                Create New Room
              </Link>
            </div>
          </div>
        </div>

        <footer className="py-4 text-center text-[11px] sm:text-xs dark:text-zinc-600 text-zinc-400 font-mono">
          Auto-expires in 60 minutes
        </footer>
      </main>
    );
  }

  // 3. Pre-Chat Nickname Confirmation View
  if (!hasJoined) {
    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-between p-4 sm:p-12 dark:bg-[#0f0f11] bg-[#fafafa] dark:text-zinc-100 text-zinc-900 font-sans overflow-x-hidden">
        <div className="w-full max-w-sm flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs dark:text-zinc-400 text-zinc-600 hover:dark:text-zinc-200 transition-colors font-medium py-1"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Link>
          <ThemeToggle />
        </div>

        <div className="w-full max-w-sm my-auto py-4">
          <div className="p-5 sm:p-8 rounded-2xl dark:bg-[#18181b] bg-white border dark:border-zinc-800 border-zinc-200 space-y-5">
            <div className="space-y-1">
              <h1 className="text-base sm:text-lg font-bold tracking-tight dark:text-white text-zinc-950 leading-snug">
                {roomName ? (
                  <>
                    You&apos;ve been invited to chat in{" "}
                    <span className="text-zinc-900 dark:text-white font-bold">{roomName}</span>{" "}
                    <span className="text-[#128c7e] dark:text-[#25d366] font-mono text-xs sm:text-sm font-normal">({code})</span>
                  </>
                ) : (
                  <>
                    You&apos;ve been invited to chat in room{" "}
                    <span className="text-[#128c7e] dark:text-[#25d366] font-mono">{code}</span>
                  </>
                )}
              </h1>
            </div>

            {joinError && (
              <div className="p-3 rounded-xl bg-red-500/10 text-red-500 text-xs font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{joinError}</span>
              </div>
            )}

            {/* Single Input: Temporary Nickname */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleJoinChatClick();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <label
                  htmlFor="invite-temporary-name"
                  className="block text-xs font-medium uppercase tracking-wider dark:text-zinc-400 text-zinc-600"
                >
                  Temporary Nickname
                </label>
                <input
                  id="invite-temporary-name"
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (joinError) setJoinError(null);
                  }}
                  placeholder="Anonymous"
                  maxLength={20}
                  className="w-full py-2.5 px-3.5 rounded-xl dark:bg-[#0f0f11] bg-zinc-100 border dark:border-zinc-800 border-zinc-300 dark:text-white text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#128c7e]/50 dark:focus:ring-[#25d366]/50 focus:border-[#128c7e] dark:focus:border-[#25d366] transition-all text-sm font-sans"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 px-5 rounded-xl font-medium text-white dark:text-[#0b1210] dark:font-bold bg-[#128c7e] hover:bg-[#0f766a] dark:bg-[#25d366] hover:dark:bg-[#20bd5a] transition-colors duration-150 cursor-pointer text-center text-sm"
              >
                Join Chat
              </button>
            </form>
          </div>
        </div>

        <footer className="py-4 text-center text-[11px] sm:text-xs dark:text-zinc-600 text-zinc-400 font-mono">
          Auto-expires in 60 minutes
        </footer>
      </main>
    );
  }

  // 4. Live Real-Time Chat Room View - Scaled for Small Mobile Phones (iPhone 12 / SE)
  const currentUserNickname = name.trim() || "Anonymous";
  const isMessageTooLong = inputMessage.length > 1000;

  const visibleMessages = messages.filter((msg) => {
    if (msg.type === "system") return true;
    if (!msg.nickname) return true;
    const lowerName = msg.nickname.toLowerCase();

    if (localClearedMyMessages && lowerName === currentUserNickname.toLowerCase()) return false;
    if (blockedUsers.includes(lowerName)) return false;
    if (hiddenUsers.includes(lowerName)) return false;
    if (filterNickname && lowerName !== filterNickname.toLowerCase()) return false;

    return true;
  });

  const renderParticipantsContent = (isMobile = false) => (
    <div className="flex flex-col h-full font-sans">
      <div className="flex items-center justify-between pb-3 border-b dark:border-zinc-800 border-zinc-200 mb-3">
        <h2 className="text-xs font-bold uppercase tracking-wider dark:text-zinc-400 text-zinc-600 flex items-center gap-2">
          <Users className="w-4 h-4 text-[#128c7e] dark:text-[#25d366]" />
          <span>Participants ({onlineUsers.length})</span>
        </h2>
        {filterNickname && (
          <button
            type="button"
            onClick={() => {
              setFilterNickname(null);
              if (isMobile) setShowMobileDrawer(false);
            }}
            className="text-[11px] text-[#128c7e] dark:text-[#25d366] font-medium cursor-pointer"
          >
            Clear filter
          </button>
        )}
      </div>

      <div className="space-y-1 flex-1 overflow-y-auto">
        {onlineUsers.length === 0 ? (
          <p className="text-xs dark:text-zinc-500 text-zinc-400 italic p-2 text-center">
            No active participants
          </p>
        ) : (
          onlineUsers.map((u, i) => {
            const isMe = u.nickname === currentUserNickname;
            const userColor = getColorById(u.colorId);
            const isFiltered = filterNickname?.toLowerCase() === u.nickname.toLowerCase();
            const isHidden = hiddenUsers.includes(u.nickname.toLowerCase());
            const userInitial = getFirstInitial(u.nickname);

            return (
              <div
                key={`${u.nickname}-${i}`}
                onClick={() => {
                  setFilterNickname(isFiltered ? null : u.nickname);
                  if (isMobile) setShowMobileDrawer(false);
                }}
                className={`group flex items-center justify-between p-2 rounded-xl transition-all cursor-pointer border ${
                  isFiltered
                    ? "dark:bg-[#25d366]/10 bg-[#128c7e]/10 border-[#128c7e]/40 dark:border-[#25d366]/40"
                    : isHidden
                    ? "opacity-40 dark:bg-[#0f0f11] bg-zinc-100 dark:border-zinc-800 border-zinc-200"
                    : "dark:bg-[#18181b] bg-white dark:border-zinc-800 border-zinc-200 hover:dark:bg-zinc-800 hover:bg-zinc-100"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Clean Server Auto-Assigned Color Initial Avatar Circle */}
                  <span className={`w-7 h-7 rounded-full ${userColor.bgClass} text-white font-mono text-xs font-bold flex items-center justify-center shrink-0`}>
                    {userInitial}
                  </span>

                  <div className="truncate">
                    <span className={`text-xs font-mono font-medium block truncate ${
                      isFiltered
                        ? "text-[#128c7e] dark:text-[#25d366] font-bold"
                        : isHidden
                        ? "line-through dark:text-zinc-500 text-zinc-400"
                        : "dark:text-zinc-200 text-zinc-800"
                    }`}>
                      {u.nickname} {isMe && <span className="text-[10px] text-zinc-400 font-sans font-normal">(You)</span>}
                    </span>
                  </div>
                </div>

                {!isMe && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleHideUser(u.nickname);
                    }}
                    className={`p-1 rounded-lg transition-colors cursor-pointer shrink-0 ${
                      isHidden
                        ? "text-[#128c7e] dark:text-[#25d366]"
                        : "opacity-80 md:opacity-0 group-hover:opacity-100 dark:text-zinc-400 text-zinc-500 hover:dark:text-zinc-200"
                    }`}
                    title={isHidden ? `Unhide ${u.nickname}` : `Hide ${u.nickname}`}
                  >
                    {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <main
      className="min-h-[100dvh] max-h-[100dvh] h-[100dvh] flex flex-col dark:bg-[#0f0f11] bg-[#fafafa] dark:text-zinc-100 text-zinc-900 overflow-hidden font-sans transition-colors duration-150"
      onClick={() => {
        setActiveMenuMessageId(null);
      }}
    >
      {/* Top Header - Optimized for Small Phone Viewports */}
      <header className="z-10 dark:border-zinc-800 border-zinc-200 dark:bg-[#18181b] bg-white px-3 sm:px-8 py-2.5 sm:py-3 flex items-center justify-between shrink-0 border-b">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={handleLeaveRoom}
            className="p-1 rounded-xl dark:text-zinc-400 text-zinc-500 hover:dark:text-zinc-200 hover:text-zinc-900 transition-colors cursor-pointer shrink-0"
            title="Leave Chat"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
            <span className="w-2 h-2 rounded-full bg-[#128c7e] dark:bg-[#25d366] shrink-0" />
            {roomName ? (
              <h1 className="text-xs sm:text-sm font-bold dark:text-white text-zinc-900 truncate max-w-[140px] xs:max-w-[200px] sm:max-w-none">
                {roomName}{" "}
                <span className="font-mono text-zinc-400 font-normal text-xs ml-0.5">
                  ({code})
                </span>
              </h1>
            ) : (
              <h1 className="text-xs sm:text-sm font-bold dark:text-white text-zinc-900 font-mono tracking-wider">
                Room {code}
              </h1>
            )}
            <span className="hidden md:inline text-xs dark:text-zinc-400 text-zinc-600 font-mono font-medium shrink-0">
              ({onlineUsers.length} online)
            </span>
          </div>
        </div>

        {/* Right Side DESKTOP VIEW */}
        <div className="hidden md:flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowDeleteAllModal(true)}
            className="py-1.5 px-3 rounded-xl text-xs font-medium text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
            title="Delete all my messages for everyone"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete All My Messages</span>
          </button>

          <button
            type="button"
            onClick={() => setShowClearMyMessagesModal(true)}
            className="py-1.5 px-3 rounded-xl text-xs font-medium dark:text-zinc-300 text-zinc-600 hover:dark:bg-zinc-800 hover:bg-zinc-100 transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
            title="Clear my sent messages from my view only"
          >
            <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
            <span>Clear My View</span>
          </button>

          <button
            type="button"
            onClick={handleCopyLink}
            className="py-1.5 px-3 rounded-xl text-xs font-medium dark:text-zinc-200 text-zinc-700 hover:dark:bg-zinc-800 hover:bg-zinc-100 transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-zinc-400" />
                <span>Copy Link</span>
              </>
            )}
          </button>

          <ThemeToggle />
        </div>

        {/* Right Side MOBILE VIEW */}
        <div className="md:hidden flex items-center shrink-0 ml-2">
          <button
            type="button"
            onClick={() => setShowMobileDrawer((prev) => !prev)}
            className="p-1.5 rounded-xl dark:text-zinc-200 text-zinc-700 hover:dark:bg-zinc-800 hover:bg-zinc-100 transition-colors cursor-pointer"
            title="Room Options Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Notifications / Toast Banners */}
      {rateLimitError && (
        <div className="z-20 bg-red-500/10 border-b border-red-500/20 py-2 px-3 text-center text-[11px] sm:text-xs font-medium text-red-500 flex items-center justify-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
          <span>{rateLimitError}</span>
        </div>
      )}

      {reportToast && (
        <div className="z-20 bg-emerald-500/10 border-b border-emerald-500/20 py-2 px-3 text-center text-[11px] sm:text-xs font-medium text-emerald-600 flex items-center justify-center gap-1.5">
          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>{reportToast}</span>
        </div>
      )}

      {/* Two-Pane Workspace Layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden z-10">
        
        {/* LEFT COLUMN: Main Chat Feed & Input */}
        <section className="flex-1 flex flex-col min-w-0 md:border-r dark:border-zinc-800 border-zinc-200 relative">
          
          {/* Active Filter Bar */}
          {(blockedUsers.length > 0 || filterNickname || localClearedMyMessages) && (
            <div className="z-10 dark:bg-[#18181b] bg-white border-b dark:border-zinc-800 border-zinc-200 px-3 sm:px-4 py-1.5 sm:py-2 flex items-center justify-between text-xs gap-2 font-sans">
              <div className="flex items-center gap-1.5 overflow-x-auto">
                {filterNickname && (
                  <span className="inline-flex items-center gap-1 py-0.5 px-2.5 rounded-full bg-[#128c7e]/10 dark:bg-[#25d366]/10 border border-[#128c7e]/30 dark:border-[#25d366]/30 text-[#128c7e] dark:text-[#25d366] font-medium text-[11px]">
                    <span>Viewing: <strong className="font-mono">{filterNickname}</strong></span>
                    <button
                      type="button"
                      onClick={() => setFilterNickname(null)}
                      className="text-[#128c7e] dark:text-[#25d366] hover:opacity-80 font-bold cursor-pointer ml-1"
                    >
                      ✕
                    </button>
                  </span>
                )}

                {localClearedMyMessages && (
                  <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-full bg-[#128c7e]/10 dark:bg-[#25d366]/10 border border-[#128c7e]/20 dark:border-[#25d366]/20 text-[#128c7e] dark:text-[#25d366] font-medium text-[10px]">
                    <span>Sent messages hidden locally</span>
                    <button
                      type="button"
                      onClick={() => setLocalClearedMyMessages(false)}
                      className="text-[#128c7e] dark:text-[#25d366] hover:opacity-80 font-bold cursor-pointer ml-1"
                    >
                      ✕
                    </button>
                  </span>
                )}

                {blockedUsers.length > 0 && (
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="dark:text-zinc-500 text-zinc-400 font-medium text-[10px]">Blocked:</span>
                    {blockedUsers.map((blockedName) => (
                      <span
                        key={blockedName}
                        className="inline-flex items-center gap-1 py-0.5 px-2 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 font-mono text-[10px]"
                      >
                        <span>{blockedName}</span>
                        <button
                          type="button"
                          onClick={() => handleUnblockUser(blockedName)}
                          className="text-red-500 hover:text-red-700 font-bold cursor-pointer ml-0.5"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {filterNickname && (
                <button
                  type="button"
                  onClick={() => setFilterNickname(null)}
                  className="text-[11px] text-zinc-400 hover:text-zinc-200 underline font-medium cursor-pointer shrink-0"
                >
                  Show All
                </button>
              )}
            </div>
          )}

          {/* Messages Stream Container */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3.5 sm:space-y-4">
            {visibleMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 dark:text-zinc-500 text-zinc-400 space-y-2">
                <MessageSquareDashed className="w-8 h-8 opacity-40" />
                <p className="text-xs font-mono">
                  {filterNickname ? `No messages from ${filterNickname}` : "No messages in room yet"}
                </p>
              </div>
            ) : (
              visibleMessages.map((msg) => {
                if (msg.type === "system") {
                  return (
                    <div key={msg.id} className="flex justify-center my-2 sm:my-3">
                      <span className="text-[11px] sm:text-xs dark:text-zinc-400 text-zinc-600 dark:bg-[#18181b] bg-white dark:border-zinc-800 border-zinc-200 border py-0.5 px-2.5 sm:py-1 sm:px-3 rounded-full font-medium">
                        {msg.message}
                      </span>
                    </div>
                  );
                }

                const isMe = msg.nickname === currentUserNickname;
                const isMenuOpen = activeMenuMessageId === msg.id;
                const isHighlighted = highlightedMsgId === msg.id;

                const msgColor = getColorById(msg.colorId);
                const initialLetter = getFirstInitial(msg.nickname);

                return (
                  <SwipeableMessageItem
                    key={msg.id}
                    msg={msg}
                    onReply={handleInitiateReply}
                  >
                    <div
                      id={msg.id}
                      className={`group relative flex flex-col transition-all duration-150 ${
                        isMe ? "items-end" : "items-start"
                      }`}
                    >
                      {/* Sender Nickname + Server Auto-Assigned Initial Avatar Circle */}
                      <div className={`flex items-center gap-1.5 mb-1 px-1 text-[11px] dark:text-zinc-400 text-zinc-500 font-medium ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                        <span className={`w-5 h-5 rounded-full ${msgColor.bgClass} text-white font-mono text-[10px] font-bold flex items-center justify-center shrink-0`}>
                          {initialLetter}
                        </span>
                        <span className="font-mono">{isMe ? "You" : msg.nickname}</span>
                      </div>

                      {/* Message Bubble + Action Buttons */}
                      <div
                        className={`relative flex items-center gap-1.5 sm:gap-2 max-w-[85%] sm:max-w-[75%] ${
                          isMe ? "flex-row-reverse" : "flex-row"
                        }`}
                      >
                        {/* 3-Dots Action Menu Toggle Button */}
                        {!msg.isDeleted && (
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuMessageId(isMenuOpen ? null : msg.id);
                              }}
                              className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1 rounded-lg dark:text-zinc-400 text-zinc-500 hover:dark:text-zinc-200 transition-all cursor-pointer shrink-0"
                              title="Options"
                            >
                              <MoreVertical className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                            </button>

                            {/* Dropdown Menu */}
                            {isMenuOpen && (
                              <div
                                className={`absolute bottom-8 z-30 w-44 rounded-xl dark:bg-[#18181b] bg-white border dark:border-zinc-800 border-zinc-200 shadow-xl py-1 text-xs font-sans ${
                                  isMe ? "right-0" : "left-0"
                                }`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleInitiateReply(msg)}
                                  className="w-full text-left px-3 py-2 dark:text-zinc-200 text-zinc-700 hover:dark:bg-[#202023] hover:bg-zinc-100 transition-colors flex items-center gap-2 cursor-pointer"
                                >
                                  <CornerDownRight className="w-3.5 h-3.5 text-[#128c7e] dark:text-[#25d366]" />
                                  <span>Reply</span>
                                </button>

                                {isMe && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDeleteConfirmMessageId(msg.id);
                                      setActiveMenuMessageId(null);
                                    }}
                                    className="w-full text-left px-3 py-2 text-red-500 hover:dark:bg-[#202023] hover:bg-zinc-100 transition-colors flex items-center gap-2 cursor-pointer font-medium"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                    <span>Delete for Everyone</span>
                                  </button>
                                )}

                                {!isMe && msg.nickname && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleBlockUser(msg.nickname!)}
                                      className="w-full text-left px-3 py-2 text-red-500 hover:dark:bg-[#202023] hover:bg-zinc-100 transition-colors flex items-center gap-2 cursor-pointer"
                                    >
                                      <UserX className="w-3.5 h-3.5" />
                                      <span>Block User</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setReportTarget({
                                          nickname: msg.nickname!,
                                          messageText: msg.message,
                                        });
                                        setActiveMenuMessageId(null);
                                      }}
                                      className="w-full text-left px-3 py-2 dark:text-zinc-300 text-zinc-700 hover:dark:bg-[#202023] hover:bg-zinc-100 transition-colors flex items-center gap-2 cursor-pointer"
                                    >
                                      <Flag className="w-3.5 h-3.5 dark:text-zinc-400 text-zinc-500" />
                                      <span>Report Message</span>
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Message Bubble Content */}
                        <div
                          className={`py-2 px-3 sm:px-3.5 rounded-xl text-xs sm:text-sm break-words transition-all ${
                            isHighlighted ? "ring-2 ring-[#128c7e] dark:ring-[#25d366]" : ""
                          } ${
                            msg.isDeleted
                              ? "dark:bg-[#18181b]/50 bg-zinc-200/60 dark:text-zinc-500 text-zinc-400 italic border dark:border-zinc-800 border-zinc-300"
                              : isMe
                              ? `${msgColor.bgClass} text-white rounded-tr-xs`
                              : "dark:bg-[#18181b] bg-white text-zinc-900 dark:text-zinc-100 border dark:border-zinc-800 border-zinc-200 rounded-tl-xs"
                          }`}
                        >
                          {/* Quoted Reply Preview */}
                          {!msg.isDeleted && msg.replyTo && (
                            <div
                              onClick={() => handleScrollToOriginalMessage(msg.replyTo!.id)}
                              className={`mb-1.5 p-1.5 rounded-md border-l-2 text-[11px] sm:text-xs cursor-pointer transition-colors ${
                                isMe
                                  ? "bg-black/20 border-white/40 text-white/90"
                                  : "dark:bg-[#0f0f11] bg-zinc-100 border-[#128c7e] dark:border-[#25d366] dark:text-zinc-300 text-zinc-700"
                              }`}
                            >
                              <span className="block font-semibold font-mono text-[10px] opacity-90">
                                {msg.replyTo.nickname}
                              </span>
                              <p className="truncate opacity-80 font-normal text-[11px] sm:text-xs">
                                {msg.replyTo.messageSnippet}
                              </p>
                            </div>
                          )}

                          <p className="leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                          <span
                            className={`block text-[9px] sm:text-[10px] font-mono text-right mt-1 ${
                              msg.isDeleted
                                ? "dark:text-zinc-600 text-zinc-400"
                                : isMe
                                ? "opacity-75"
                                : "dark:text-zinc-400 text-zinc-500"
                            }`}
                          >
                            {msg.timestamp}
                          </span>
                        </div>
                      </div>
                    </div>
                  </SwipeableMessageItem>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input Footer - Optimized for Small Phone Viewports */}
          <footer className="z-10 p-2.5 sm:p-4 border-t dark:border-zinc-800 border-zinc-200 dark:bg-[#18181b] bg-white shrink-0 relative font-sans">
            {showEmojiPicker && (
              <div className="absolute bottom-16 sm:bottom-20 right-2 sm:right-4 z-40 border dark:border-zinc-800 border-zinc-200 rounded-2xl overflow-hidden animate-fadeIn max-w-[290px] sm:max-w-none">
                <EmojiPicker
                  onEmojiClick={handleEmojiClick}
                  theme={theme === "dark" ? Theme.DARK : Theme.LIGHT}
                  width={280}
                  height={320}
                />
              </div>
            )}

            <form
              onSubmit={handleSendMessage}
              className="w-full flex flex-col gap-1.5 sm:gap-2"
            >
              {replyingTo && (
                <div className="flex items-center justify-between p-1.5 px-2.5 rounded-xl dark:bg-[#0f0f11] bg-zinc-100 border border-[#128c7e]/30 dark:border-[#25d366]/30 text-[11px] sm:text-xs">
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <CornerDownRight className="w-3.5 h-3.5 text-[#128c7e] dark:text-[#25d366] shrink-0" />
                    <span className="dark:text-zinc-400 text-zinc-600 font-medium shrink-0">
                      Replying to <span className="text-[#128c7e] dark:text-[#25d366] font-mono font-semibold">{replyingTo.nickname}</span>:
                    </span>
                    <span className="dark:text-zinc-300 text-zinc-800 truncate italic">
                      &quot;{replyingTo.messageSnippet}&quot;
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className="dark:text-zinc-400 text-zinc-500 hover:dark:text-zinc-200 font-bold p-1 cursor-pointer shrink-0 ml-1"
                    title="Cancel reply"
                  >
                    ✕
                  </button>
                </div>
              )}

              <div className="flex items-center gap-1.5 sm:gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder={replyingTo ? `Replying to ${replyingTo.nickname}...` : "Type a message..."}
                  maxLength={1000}
                  className="flex-1 py-2 sm:py-2.5 px-3 sm:px-3.5 rounded-xl dark:bg-[#0f0f11] bg-zinc-100 dark:border-zinc-800 border-zinc-300 dark:text-white text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#128c7e]/50 dark:focus:ring-[#25d366]/50 focus:border-[#128c7e] dark:focus:border-[#25d366] transition-all text-xs sm:text-sm font-sans"
                />

                <button
                  type="button"
                  onClick={() => setShowEmojiPicker((prev) => !prev)}
                  className={`p-2 sm:p-2.5 rounded-xl transition-colors cursor-pointer text-base shrink-0 ${
                    showEmojiPicker
                      ? "bg-[#128c7e]/20 dark:bg-[#25d366]/20 text-[#128c7e] dark:text-[#25d366]"
                      : "dark:bg-[#0f0f11] bg-zinc-100 dark:text-zinc-400 text-zinc-600 hover:dark:bg-zinc-800"
                  }`}
                  title="Add Emoji"
                >
                  <Smile className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>

                <button
                  type="submit"
                  disabled={!inputMessage.trim() || isMessageTooLong}
                  className={`py-2 sm:py-2.5 px-3 sm:px-4 rounded-xl font-medium text-white ${getColorById(colorId).bgClass} hover:opacity-90 active:opacity-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center justify-center gap-1.5 text-xs sm:text-sm shrink-0`}
                >
                  <span className="hidden sm:inline">Send</span>
                  <Send className="w-4 h-4" />
                </button>
              </div>

              {inputMessage.length > 700 && (
                <div className="flex justify-end px-1">
                  <span
                    className={`text-[10px] sm:text-[11px] font-mono font-medium ${
                      inputMessage.length >= 1000 ? "text-red-500" : "dark:text-zinc-500 text-zinc-400"
                    }`}
                  >
                    {inputMessage.length}/1000
                  </span>
                </div>
              )}
            </form>
          </footer>
        </section>

        {/* RIGHT COLUMN: Desktop Participants Sidebar */}
        <aside className="hidden md:flex w-72 sm:w-80 dark:bg-[#0f0f11] bg-zinc-50 flex-col shrink-0 border-l dark:border-zinc-800 border-zinc-200 p-4 overflow-hidden">
          {renderParticipantsContent(false)}
        </aside>
      </div>

      {/* Mobile Menu Panel (< md) - Scaled for Small Phones (iPhone 12 / SE) */}
      {showMobileDrawer && (
        <div
          className="fixed inset-0 z-50 flex justify-end md:hidden bg-black/60 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowMobileDrawer(false)}
        >
          <div
            className="w-[82vw] max-w-[300px] h-full p-4 dark:bg-[#18181b] bg-white border-l dark:border-zinc-800 border-zinc-200 flex flex-col text-left space-y-4 overflow-y-auto font-sans"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b dark:border-zinc-800 border-zinc-200">
              <span className="text-xs font-bold uppercase tracking-wider dark:text-zinc-400 text-zinc-600">
                Room Options
              </span>
              <button
                type="button"
                onClick={() => setShowMobileDrawer(false)}
                className="p-1 text-zinc-400 hover:text-zinc-200 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1 pb-3 border-b dark:border-zinc-800 border-zinc-200">
              <button
                type="button"
                onClick={handleCopyLink}
                className="w-full text-left p-2 rounded-xl hover:dark:bg-zinc-800 hover:bg-zinc-100 text-xs font-medium dark:text-zinc-200 text-zinc-800 flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-[#128c7e] dark:text-[#25d366]" />}
                <span>{copied ? "Copied!" : "Copy Room Link"}</span>
              </button>

              <button
                type="button"
                onClick={toggleTheme}
                className="w-full text-left p-2 rounded-xl hover:dark:bg-zinc-800 hover:bg-zinc-100 text-xs font-medium dark:text-zinc-200 text-zinc-800 flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                {theme === "dark" ? (
                  <span>Switch to Light Theme</span>
                ) : (
                  <span>Switch to Dark Theme</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowClearMyMessagesModal(true)}
                className="w-full text-left p-2 rounded-xl hover:dark:bg-zinc-800 hover:bg-zinc-100 text-xs font-medium dark:text-zinc-300 text-zinc-700 flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4 text-[#128c7e] dark:text-[#25d366]" />
                <span>Clear My View</span>
              </button>

              <button
                type="button"
                onClick={() => setShowDeleteAllModal(true)}
                className="w-full text-left p-2 rounded-xl hover:bg-red-500/10 text-xs font-bold text-red-500 flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4 text-red-500" />
                <span>Delete All My Messages</span>
              </button>
            </div>

            <div className="flex-1 min-h-[250px]">
              {renderParticipantsContent(true)}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (Individual) */}
      {deleteConfirmMessageId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
          onClick={() => setDeleteConfirmMessageId(null)}
        >
          <div
            className="w-full max-w-xs sm:max-w-sm p-5 sm:p-6 rounded-2xl dark:bg-[#18181b] bg-white border dark:border-zinc-800 border-zinc-200 space-y-4 text-center font-sans"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1">
              <h3 className="text-sm sm:text-base font-bold dark:text-white text-zinc-900">Delete Message?</h3>
              <p className="text-xs dark:text-zinc-400 text-zinc-600">
                This will delete your message for everyone in the room.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmMessageId(null)}
                className="w-full py-2 px-3 rounded-xl text-xs font-medium dark:bg-[#0f0f11] bg-zinc-100 dark:text-zinc-300 text-zinc-700 hover:bg-zinc-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteMessage}
                className="w-full py-2 px-3 rounded-xl text-xs font-medium text-white bg-red-600 hover:bg-red-500 transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete ALL My Messages Modal */}
      {showDeleteAllModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowDeleteAllModal(false)}
        >
          <div
            className="w-full max-w-xs sm:max-w-sm p-5 sm:p-6 rounded-2xl dark:bg-[#18181b] bg-white border dark:border-zinc-800 border-zinc-200 space-y-4 text-center font-sans"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1">
              <h3 className="text-sm sm:text-base font-bold dark:text-white text-zinc-900">Delete ALL your messages?</h3>
              <p className="text-xs dark:text-zinc-400 text-zinc-600">
                This will permanently delete <strong>ALL your messages for EVERYONE</strong> in this room.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteAllModal(false)}
                className="w-full py-2 px-3 rounded-xl text-xs font-medium dark:bg-[#0f0f11] bg-zinc-100 dark:text-zinc-300 text-zinc-700 hover:bg-zinc-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteAllMessages}
                className="w-full py-2 px-3 rounded-xl text-xs font-medium text-white bg-red-600 hover:bg-red-500 transition-colors cursor-pointer font-bold"
              >
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear My Sent Messages Confirmation Modal (Local View) */}
      {showClearMyMessagesModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowClearMyMessagesModal(false)}
        >
          <div
            className="w-full max-w-xs sm:max-w-sm p-5 sm:p-6 rounded-2xl dark:bg-[#18181b] bg-white border dark:border-zinc-800 border-zinc-200 space-y-4 text-center font-sans"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1">
              <h3 className="text-sm sm:text-base font-bold dark:text-white text-zinc-900">Clear My Messages?</h3>
              <p className="text-xs dark:text-zinc-400 text-zinc-600">
                This will remove your sent messages from <strong>YOUR view only</strong>.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowClearMyMessagesModal(false)}
                className="w-full py-2 px-3 rounded-xl text-xs font-medium dark:bg-[#0f0f11] bg-zinc-100 dark:text-zinc-300 text-zinc-700 hover:bg-zinc-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClearMyMessages}
                className="w-full py-2 px-3 rounded-xl text-xs font-medium text-white dark:text-[#0b1210] dark:font-bold bg-[#128c7e] hover:bg-[#0f766a] dark:bg-[#25d366] hover:dark:bg-[#20bd5a] transition-colors duration-150 cursor-pointer"
              >
                Clear My View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {reportTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn font-sans"
          onClick={() => setReportTarget(null)}
        >
          <div
            className="w-full max-w-xs sm:max-w-md p-5 sm:p-6 rounded-2xl dark:bg-[#18181b] bg-white border dark:border-zinc-800 border-zinc-200 space-y-4 sm:space-y-5 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b dark:border-zinc-800 border-zinc-200 pb-3">
              <div>
                <h3 className="text-sm sm:text-base font-bold dark:text-white text-zinc-900">Report User</h3>
                <p className="text-xs dark:text-zinc-400 text-zinc-500">
                  Reporting <span className="text-[#128c7e] dark:text-[#25d366] font-mono">{reportTarget.nickname}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReportTarget(null)}
                className="dark:text-zinc-500 text-zinc-400 text-sm font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {reportTarget.messageText && (
              <div className="p-2.5 rounded-xl dark:bg-[#0f0f11] bg-zinc-100 border dark:border-zinc-800 border-zinc-200 text-xs dark:text-zinc-400 text-zinc-600 italic">
                &quot;{reportTarget.messageText}&quot;
              </div>
            )}

            <form onSubmit={handleSubmitReport} className="space-y-4">
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wider dark:text-zinc-400 text-zinc-600">
                  Reason for Report
                </label>
                <div className="space-y-1.5">
                  {REPORT_REASONS.map((reason) => (
                    <label
                      key={reason}
                      className={`flex items-center gap-3 p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                        selectedReason === reason
                          ? "bg-[#128c7e]/10 dark:bg-[#25d366]/20 border-[#128c7e]/50 dark:border-[#25d366]/50 dark:text-white text-zinc-900 font-medium"
                          : "dark:bg-[#0f0f11] bg-zinc-50 dark:border-zinc-800 border-zinc-200 dark:text-zinc-300 text-zinc-700 hover:bg-zinc-100"
                      }`}
                    >
                      <input
                        type="radio"
                        name="report-reason"
                        value={reason}
                        checked={selectedReason === reason}
                        onChange={(e) => setSelectedReason(e.target.value)}
                        className="accent-[#128c7e] dark:accent-[#25d366]"
                      />
                      <span>{reason}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReportTarget(null)}
                  className="py-2 px-3 rounded-xl text-xs font-medium dark:text-zinc-400 text-zinc-600 hover:dark:text-zinc-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReport}
                  className="py-2 px-4 rounded-xl text-xs font-medium text-white dark:text-[#0b1210] dark:font-bold bg-[#128c7e] hover:bg-[#0f766a] dark:bg-[#25d366] hover:dark:bg-[#20bd5a] transition-colors duration-150 cursor-pointer"
                >
                  {submittingReport ? "Submitting..." : "Submit Report"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
