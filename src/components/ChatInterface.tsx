'use client'
import { ChatMessage, TraceEvent } from "@/types/type"
import { useEffect, useMemo, useRef, useState } from "react"
import { TimelineRow } from "./TimelineRow"
import ArrowIndex from "./ArrowIndex"
import diffObjects from "@/utils/diffObjects"
import DiffTreeNode from "./DiffTreeNode"

import type { StreamState, FilterType } from "../types/type"

export default function ChatInterface() {
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
    const [userMessage, setUserMessage] = useState<string>("")
    const [ws, setWs] = useState<WebSocket | null>(null)
    const [streamState, setStreamState] = useState<StreamState>("idle")
    const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([])
    const [highlightedId, setHighlightedId] = useState<string | null>(null)
    const [filterType, setFilterType] = useState<FilterType>("ALL")
    const [searchQuery, setSearchQuery] = useState<string>("")
    const [contextHistory, setContextHistory] = useState<Record<string, any[]>>({})
    const [activeContextId, setActiveContextId] = useState<string | null>(null)
    const [historyIndex, setHistoryIndex] = useState<number>(0)
    const [activeTab, setActiveTab] = useState<"chat" | "timeline" | "context">("chat")
    const activeHistory = activeContextId ? contextHistory[activeContextId] : null
    const currSnapshot = activeHistory ? activeHistory[historyIndex] : null
    const prevSnapshot = activeHistory && historyIndex > 0 ? activeHistory[historyIndex - 1] : null
    const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "reconnecting">("connected")
    const reconnectAttempts = useRef<number>(0)
    const highestSeq = useRef<number>(0)
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const nackTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const outOfOrder = useRef<Map<number, any>>(new Map())
    const isInputDisabled = connectionStatus !== "connected" || streamState === "streaming" || streamState === "showing_tool_card" || streamState === "showing_tool_result"

    const calculatedDiff = useMemo(() => {
        return currSnapshot ? (prevSnapshot ? diffObjects(prevSnapshot, currSnapshot) : diffObjects(currSnapshot, currSnapshot)) : null
    }, [currSnapshot, prevSnapshot])

    const appendTraceEvent = (newEvent: Omit<TraceEvent, "id" | "timestamp">) => {
        const timestamp = Date.now()
        const id = `${newEvent.type}-${newEvent.seq || "no-seq"}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

        setTraceEvents(prev => {
            if (newEvent.type === "TOKEN_BATCH") {
                const lastEvent = prev[prev.length - 1]
                if (lastEvent && lastEvent.type === "TOKEN_BATCH" && lastEvent.stream_id === newEvent.stream_id) {
                    const updatedEvent: TraceEvent = {
                        ...lastEvent,
                        text: (lastEvent.text || "") + (newEvent.text || ""),
                        tokenCount: (lastEvent.tokenCount || 0) + 1,
                        duration: (timestamp - lastEvent.timestamp) / 1000,
                    }
                    return [...prev.slice(0, -1), updatedEvent]
                }
            }
            return [...prev, { id, timestamp, ...newEvent }]
        })
    }

    const handleScrollAndHighlight = (key: string, source: "timeline" | "chat") => {
        setHighlightedId(key)
        if (source === "timeline") {
            const targetElement = document.getElementById(`chat-target-${key}`)
            if (targetElement) {
                targetElement.scrollIntoView({ behavior: "smooth", block: "center" })
            }
        }
        else if (source === "chat") {
            const matchingEvent = traceEvents.find(
                e => e.call_id === key || e.stream_id === key
            )
            if (matchingEvent) {
                const targetElement = document.getElementById(`timeline-row-${matchingEvent.id}`)
                if (targetElement) {
                    targetElement.scrollIntoView({ behavior: "smooth", block: "center" })
                }
            }
        }
    }

    const executeMessage = (message: any, socket: WebSocket) => {
        if (message.type === "PING") {
            const pongPayload = {
                type: "PONG",
                echo: message.challenge || ""
            }

            appendTraceEvent({
                type: "PING_PONG",
                seq: message.seq,
                details: { challenge: message.challenge, response: pongPayload }
            })

            socket.send(JSON.stringify(pongPayload))
            console.log(`[HEARTBEAT] Received PING [seq: ${message.seq}]. Challenge: "${message.challenge || ""}"`)
            return
        }

        if (message.type === "ERROR") {
            setStreamState("error")
            console.error("Server reported an error:", message.message)

            appendTraceEvent({
                type: "ERROR",
                seq: message.seq,
                details: { code: message.code, message: message.message }
            })
            return
        }

        if (message.type === "CONTEXT_SNAPSHOT") {
            const { context_id, data } = message
            setContextHistory(prev => {
                const existingHistory = prev[context_id] || []
                const updatedHistory = [...existingHistory, data]
                setHistoryIndex(updatedHistory.length - 1)
                return {
                    ...prev,
                    [context_id]: updatedHistory
                }
            })
            setActiveContextId(context_id)
            appendTraceEvent({
                type: "CONTEXT_SNAPSHOT",
                seq: message.seq,
                details: message.data
            })
            return
        }

        if (message.type === "TOKEN") {
            setStreamState(prev => prev !== "streaming" ? "streaming" : prev)
            setChatMessages(prev => {
                const existingMessageIndex = prev.findIndex(
                    msg => msg.sender === "agent" && msg.stream_id === message.stream_id
                )

                if (existingMessageIndex === -1) {
                    return [...prev, {
                        id: `agent-${Date.now()}`,
                        sender: "agent",
                        stream_id: message.stream_id,
                        blocks: [
                            {
                                type: "text",
                                text: message.text
                            }
                        ]
                    }]
                }

                return prev.map((msg, idx) => {
                    if (idx !== existingMessageIndex) return msg

                    const updatedBlocks = [...msg.blocks]
                    const lastBlock = updatedBlocks[updatedBlocks.length - 1]

                    if (lastBlock && lastBlock.type === "text") {
                        updatedBlocks[updatedBlocks.length - 1] = {
                            ...lastBlock,
                            text: lastBlock.text + message.text
                        }
                    } else {
                        updatedBlocks.push({
                            type: "text",
                            text: message.text
                        })
                    }

                    return { ...msg, blocks: updatedBlocks }
                })
            })
            appendTraceEvent({ type: "TOKEN_BATCH", seq: message.seq, text: message.text, stream_id: message.stream_id })
            return
        }

        if (message.type === "TOOL_CALL") {
            setStreamState("showing_tool_card")
            setChatMessages(prev =>
                prev.map((msg) => {
                    if (msg.stream_id === message.stream_id) {
                        return {
                            ...msg,
                            blocks: [...msg.blocks, {
                                type: "tool",
                                call_id: message.call_id,
                                tool_name: message.tool_name,
                                args: message.args,
                                status: "pending"
                            }]
                        }
                    }
                    return msg
                })
            )
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                    type: "TOOL_ACK",
                    call_id: message.call_id
                }))
                console.log("Sent TOOL_ACK for call_id:", message.call_id)
            }
            appendTraceEvent({
                type: "TOOL_CALL",
                seq: message.seq,
                call_id: message.call_id,
                tool_name: message.tool_name,
                details: message.args,
                stream_id: message.stream_id
            })
            return
        }

        if (message.type === "TOOL_RESULT") {
            setStreamState("showing_tool_result")
            setChatMessages(prev => prev.map((msg) => {
                if (msg.stream_id === message.stream_id) {
                    return {
                        ...msg,
                        blocks: msg.blocks.map(block => {
                            if (block.type === "tool" && block.call_id === message.call_id) {
                                return {
                                    ...block,
                                    result: message.result,
                                    status: "completed"
                                }
                            }
                            return block
                        })
                    }
                }
                return msg
            }))
            appendTraceEvent({
                type: "TOOL_RESULT",
                seq: message.seq,
                call_id: message.call_id,
                details: message.result,
                stream_id: message.stream_id
            })
            return
        }

        if (message.type == "STREAM_END") {
            setStreamState("completed")
            return
        }
    }

    const processSequentialMessage = (message: any, socket: WebSocket) => {
        const seq = message.seq

        if (seq === undefined) {
            executeMessage(message, socket)
            return
        }

        // always execute control messages immediately to prevent connection drops,
        const isControlMessage = message.type === "PING" || message.type === "ERROR"
        if (isControlMessage) {
            executeMessage(message, socket)
        }

        if (seq <= highestSeq.current) {
            console.warn(`[CHAOS: DEDUPLICATE] Discarded duplicate packet with seq: ${seq} (highestSeq is ${highestSeq.current})`)
            return
        }

        if (seq > highestSeq.current) {
            const nextExpected = highestSeq.current + 1
            if (nextExpected === seq) {
                highestSeq.current = seq
                if (!isControlMessage) {
                    executeMessage(message, socket)
                }

                if (nackTimeoutRef.current) {
                    clearTimeout(nackTimeoutRef.current)
                    nackTimeoutRef.current = null
                }

                const nextKey = highestSeq.current + 1
                if (outOfOrder.current.has(nextKey)) {
                    console.log(`[CHAOS: RECOVERY] Draining buffered packet seq: ${nextKey} from memory.`)
                    processSequentialMessage(outOfOrder.current.get(nextKey), socket)
                    outOfOrder.current.delete(nextKey)
                } else if (outOfOrder.current.size > 0) {
                    if (!nackTimeoutRef.current) {
                        nackTimeoutRef.current = setTimeout(() => {
                            console.log(`[NACK] Timeout waiting for seq ${highestSeq.current + 1}. Requesting RESUME.`)
                            socket.send(JSON.stringify({ type: "RESUME", last_seq: highestSeq.current }))
                        }, 1000)
                    }
                }
            }
            else if (nextExpected !== seq) {
                console.warn(`[CHAOS: OUT-OF-ORDER] Expected seq ${nextExpected}, but received seq ${seq}. Buffering packet.`)
                outOfOrder.current.set(seq, message)

                if (!nackTimeoutRef.current) {
                    nackTimeoutRef.current = setTimeout(() => {
                        console.log(`[NACK] Timeout waiting for seq ${highestSeq.current + 1}. Requesting RESUME.`)
                        socket.send(JSON.stringify({ type: "RESUME", last_seq: highestSeq.current }))
                    }, 1000)
                }
            }
            return
        }
        return
    }

    useEffect(() => {
        let isUnmounted = false
        const connectWebSocket = () => {
            if (isUnmounted) return
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)

            const socket = new WebSocket("ws://localhost:4747/ws")

            socket.onopen = () => {
                setConnectionStatus(prev => prev !== "connected" ? "connected" : prev)

                if (reconnectAttempts.current > 0) {
                    console.log(`[RECONNECT] Reconnected successfully after ${reconnectAttempts.current} attempts.`)
                    console.log(`[RECONNECT] Transmitting RESUME with last_seq: ${highestSeq.current}`)
                    socket.send(JSON.stringify({ type: "RESUME", last_seq: highestSeq.current }))
                    reconnectAttempts.current = 0
                } else {
                    console.log("Connected")
                }
            }

            socket.onclose = () => {
                if (isUnmounted) return

                setConnectionStatus("reconnecting")
                reconnectAttempts.current += 1

                reconnectTimeoutRef.current = setTimeout(() => {
                    connectWebSocket()
                }, Math.min(500 * Math.pow(2, reconnectAttempts.current), 10000))
            }

            socket.onmessage = (event) => {
                if (isUnmounted) return
                try {
                    const message = JSON.parse(event.data)
                    if (message.type !== "PING") {
                        console.log("msg recvd:", message)
                    }
                    processSequentialMessage(message, socket)

                } catch (error) {
                    setStreamState("error")
                    console.error("Error parsing WebSocket message:", error)
                }

            }

            socket.onerror = (err) => {
                if (isUnmounted) return
                console.error("[ERROR] caught an error:", err)
                setConnectionStatus("disconnected")
                socket.close()
            }

            setWs(socket)
            return socket
        }

        //  /reset endpoint to clear backend state on fresh load
        //const socketConnection = connectWebSocket()
        let socketConnection: WebSocket | undefined

        fetch("http://localhost:4747/reset")
            .then(() => {
                if (!isUnmounted) {
                    socketConnection = connectWebSocket()
                }
            })
            .catch(err => {
                console.error("Failed to reset backend state:", err)
                if (!isUnmounted) {
                    socketConnection = connectWebSocket()
                }
            })

        return () => {
            isUnmounted = true
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
            if (nackTimeoutRef.current) clearTimeout(nackTimeoutRef.current)
            if (socketConnection) {
                socketConnection.close()
            }
        }
    }, [])

    // timeout fallback to recover from aborted streams on disconnect
    useEffect(() => {
        let timeout: NodeJS.Timeout
        if (streamState === "streaming" || streamState === "showing_tool_card" || streamState === "showing_tool_result") {
            timeout = setTimeout(() => {
                console.log("[IDLE TIMEOUT] Stream stalled for 5 seconds without new events. Forcing completion to recover.")
                setStreamState("completed")
            }, 8000)
        }
        return () => {
            if (timeout) clearTimeout(timeout)
        }
    }, [streamState, chatMessages])

    const handleSendUserMessage = (msg: string) => {
        console.log("msg received:", JSON.stringify(msg))
        if (!msg || msg.trim() === "") {
            console.log("msg is empty")
            return
        }
        highestSeq.current = 0
        setStreamState("streaming")
        setChatMessages(prev => [...prev, {
            id: Date.now().toString(),
            sender: "user",
            stream_id: Date.now().toString(),
            blocks: [{ type: "text", text: msg }]
        }])
        ws?.send(JSON.stringify({ type: "USER_MESSAGE", content: msg }))
        setUserMessage("")
    }


    return (
        <div className="relative">
            {connectionStatus === "reconnecting" && (
                <div className="absolute top-4 right-4 flex items-center gap-2 bg-yellow-600/90 text-white font-semibold text-xs px-3 py-1.5 rounded-full shadow-lg border border-yellow-500 animate-pulse z-50">
                    <span className="w-2 h-2 rounded-full bg-yellow-400 animate-ping" />
                    Connection lost. Reconnecting...
                </div>
            )}

            <div className="flex flex-col gap-2 rounded-sm p-5 h-screen overflow-y-hidden bg-[#0A0F1C] text-gray-200">
                <h1 className="uppercase text-center font-extrabold text-3xl tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 mb-2">Agent Console</h1>

                {/* Mobile Tabs */}
                <div className="flex lg:hidden justify-between border-b border-gray-700 mb-2">
                    <button className={`flex-1 py-2 text-center font-semibold ${activeTab === "chat" ? "border-b-2 border-blue-500 text-blue-400" : "text-gray-400"}`} onClick={() => setActiveTab("chat")}>Chat</button>
                    <button className={`flex-1 py-2 text-center font-semibold ${activeTab === "timeline" ? "border-b-2 border-blue-500 text-blue-400" : "text-gray-400"}`} onClick={() => setActiveTab("timeline")}>Timeline</button>
                    <button className={`flex-1 py-2 text-center font-semibold ${activeTab === "context" ? "border-b-2 border-blue-500 text-blue-400" : "text-gray-400"}`} onClick={() => setActiveTab("context")}>Context</button>
                </div>

                <div className={`flex flex-col lg:grid lg:grid-cols-4 gap-4 flex-1 lg:h-[35rem] min-h-0`}>

                    {/* Chat UI */}
                    <div className={`${activeTab === "chat" ? "flex" : "hidden"} lg:flex lg:col-span-2 bg-blue-900/10 border-blue-400 border-2 p-5 rounded-md flex-col gap-4 overflow-y-auto h-full lg:max-h-[35rem]`}>
                        {chatMessages?.length > 0 ? (
                            chatMessages.map((message) => (
                                <div
                                    id={`chat-card-${message.stream_id}`}
                                    key={message.id}
                                    onClick={() => message.stream_id && handleScrollAndHighlight(message.stream_id, "chat")}
                                    className={`flex flex-col p-5 gap-3 border rounded-md w-full transition-all duration-300 cursor-pointer ${highlightedId === message.stream_id
                                        ? "border-yellow-400 bg-yellow-500/10 shadow-[0_0_15px_rgba(234,179,8,0.25)]"
                                        : message.sender === "user"
                                            ? "border-gray-500 bg-gray-900/20"
                                            : "border-blue-500 bg-blue-950/10"
                                        }`}
                                >
                                    {/* Sender Badge */}
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2 py-1 font-bold text-xs rounded-md uppercase ${message.sender === "user"
                                            ? "bg-gray-600 text-white"
                                            : "bg-blue-600 text-white"
                                            }`}>
                                            {message.sender}
                                        </span>
                                    </div>

                                    {/* Blocks render loop */}
                                    <div className="flex flex-col gap-3 pl-2">
                                        {message?.blocks?.map((block, idx) => {
                                            if (block.type === "text") {
                                                return (
                                                    <p key={idx} className="text-gray-100 text-[15px] leading-relaxed whitespace-pre-wrap">
                                                        {block.text}
                                                    </p>
                                                )
                                            }

                                            if (block.type === "tool") {
                                                const isToolHighlighted = highlightedId === block.call_id
                                                return (
                                                    <div
                                                        id={`chat-target-${block.call_id}`}
                                                        key={idx}
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            handleScrollAndHighlight(block.call_id, "chat")
                                                        }}
                                                        className={`border-2 border-dashed p-4 rounded-md my-2 cursor-pointer transition-all duration-300 ${isToolHighlighted
                                                            ? "border-yellow-400 bg-yellow-500/20 shadow-[0_0_15px_rgba(234,179,8,0.3)]"
                                                            : "border-blue-500 bg-blue-950/30"
                                                            }`}
                                                    >
                                                        <div className="flex flex-col gap-2">
                                                            <p className="font-bold text-blue-300 text-center uppercase tracking-widest text-sm mb-1">
                                                                Tool Execution
                                                            </p>
                                                            <div className="grid grid-cols-[100px_1fr] gap-2 text-sm">
                                                                <p className="font-bold text-gray-400">Call ID</p>
                                                                <p className="font-mono">{block.call_id}</p>

                                                                <p className="font-bold text-gray-400">Arguments</p>
                                                                <p className="font-mono bg-black/40 p-1 rounded text-xs break-all">
                                                                    {JSON.stringify(block.args)}
                                                                </p>

                                                                <p className="font-bold text-gray-400">Status</p>
                                                                <p className={`font-semibold ${block.status === "completed" ? "text-green-400" : "text-yellow-400 animate-pulse"}`}>
                                                                    {block.status}
                                                                </p>

                                                                {block.status === "completed" && block.result && (
                                                                    <>
                                                                        <p className="font-bold text-gray-400">Result</p>
                                                                        <p className="font-mono bg-green-950/20 p-1 rounded text-xs break-all text-green-300">
                                                                            {JSON.stringify(block.result)}
                                                                        </p>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            }
                                            return null
                                        })}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="flex items-center justify-center text-gray-500 w-full h-full">
                                No messages
                            </div>
                        )}
                    </div>

                    {/* Timeline Panel */}
                    <div className={`${activeTab === "timeline" ? "flex" : "hidden"} lg:flex lg:col-span-1 bg-blue-900/10 border-blue-400 border-2 p-5 rounded-md overflow-y-auto flex-col gap-2 h-full lg:max-h-[35rem]`}>
                        <div className="flex flex-col justify-between w-full border-b border-blue-500/30 pb-3 mb-3">
                            <div className="font-bold text-lg uppercase tracking-wide text-blue-200 text-center">Timeline</div>
                            <div className="flex flex-row flex-wrap gap-2 mt-2">
                                <select className="bg-blue-900/20 p-2 outline-none border-none rounded-md text-xs text-white" value={filterType} onChange={(e) => setFilterType(e.target.value as FilterType)}>
                                    <option value="ALL" className="bg-blue-900/20 text-black">All</option>
                                    <option value="TOKEN_BATCH" className="bg-blue-900/20 text-black">TOKEN_BATCH</option>
                                    <option value="TOOL_CALL" className="bg-blue-900/20 text-black">TOOL_CALL</option>
                                    <option value="TOOL_RESULT" className="bg-blue-900/20 text-black">TOOL_RESULT</option>
                                    <option value="CONTEXT_SNAPSHOT" className="bg-blue-900/20 text-black">CONTEXT_SNAPSHOT</option>
                                    <option value="PING_PONG" className="bg-blue-900/20 text-black">PING_PONG</option>
                                    <option value="ERROR" className="bg-blue-900/20 text-black">ERROR</option>
                                </select>
                                <input type="text" placeholder="Search" className="bg-blue-900/20 p-2 outline-none border-none rounded-md text-xs text-white" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                            </div>
                        </div>
                        {traceEvents.filter((event: TraceEvent) => {
                            const matchesType = filterType === "ALL" || event.type === filterType
                            const matchesSearch = !searchQuery ||
                                event.text?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                event.tool_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                event.call_id?.toLowerCase().includes(searchQuery.toLowerCase())
                            return matchesType && matchesSearch
                        }).map((event: TraceEvent) => {
                            const isHighlighted = highlightedId === event.id || highlightedId === event.call_id || highlightedId === event.stream_id

                            return (
                                <TimelineRow
                                    key={event.id}
                                    event={event}
                                    isHighlighted={isHighlighted}
                                    onRowClick={(eventId) => {
                                        const key = event.call_id || event.stream_id || eventId
                                        handleScrollAndHighlight(key, "timeline")
                                    }}
                                />
                            )
                        })}
                    </div>

                    {/* Context Inspector Panel */}
                    <div className={`${activeTab === "context" ? "flex" : "hidden"} lg:flex lg:col-span-1 bg-blue-900/10 border-blue-400 border-2 p-5 rounded-md overflow-y-auto flex-col gap-2 h-full lg:max-h-[35rem]`}>
                        <div className="flex justify-between w-full border-b border-blue-500/30 pb-3 mb-3">
                            <div className="font-bold text-lg uppercase tracking-wide text-blue-200 flex items-center">Context Inspector</div>
                        </div>
                        <div className="flex flex-col gap-5 mt-2">
                            <div className="font-semibold flex gap-2">Active Context ID:<p className=" font-normal">{activeContextId || "-"}</p></div>

                            <ArrowIndex maxIndex={contextHistory[activeContextId || ""]?.length || 0} activeSnapIndex={historyIndex} setActiveSnapIndex={setHistoryIndex} />
                            {
                                calculatedDiff != null && (
                                    calculatedDiff.length > 0 ? (
                                        calculatedDiff.map((node) => (
                                            <DiffTreeNode key={node.key} node={node} depth={0} />
                                        ))
                                    ) :
                                        <div className="text-gray-500 italic text-center py-4">No context active</div>
                                )
                            }
                        </div>
                    </div>
                </div>

                <div className="flex justify-center mt-2 lg:mt-0">
                    <div className={`flex items-center gap-2 w-full lg:w-1/2 border border-blue-400 rounded-md p-1 transition-opacity ${isInputDisabled ? "bg-gray-800/40 opacity-50 cursor-not-allowed" : "bg-white/90 text-black/80 bg-white"
                        }`}>
                        <textarea
                            placeholder={connectionStatus !== "connected" ? "Establishing session..." : "Type your message..."}
                            className="border-none w-full p-1 outline-none resize-none bg-transparent"
                            rows={2}
                            value={userMessage}
                            onChange={(e) => setUserMessage(e.target.value)}
                            disabled={isInputDisabled}
                        />
                        <button
                            className={`text-white px-6 py-2 rounded-sm font-semibold transition-all ${isInputDisabled ? "bg-gray-600" : "bg-blue-500 hover:bg-blue-600 active:scale-95"
                                }`}
                            onClick={() => handleSendUserMessage(userMessage)}
                            disabled={isInputDisabled}
                        >
                            Send
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}