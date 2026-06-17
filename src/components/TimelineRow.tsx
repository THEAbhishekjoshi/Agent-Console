import { TraceEvent } from "@/types/type";
import React, { useState } from "react";

interface TimelineRowProps {
    event: TraceEvent;
    isHighlighted: boolean;
    onRowClick: (eventId: string) => void;
}

export const TimelineRow = React.memo(function TimelineRow({ event, isHighlighted, onRowClick }: TimelineRowProps) {
    const [expanded, setExpanded] = useState(false)


    let borderIndentStyle = "border-l-4 border-l-transparent pl-3"
    let indentPrefix = ""

    if (event.type === "TOOL_CALL") {
        borderIndentStyle = "border-l-4 border-l-blue-400 pl-6 bg-blue-950/5"
    }
    else if (event.type === "TOOL_RESULT") {
        borderIndentStyle = "border-l-4 border-l-green-400 pl-10 bg-green-950/5"
        indentPrefix = ""
    }
    else if (event.type === "ERROR") {
        borderIndentStyle = "border-l-4 border-l-red-500 pl-3 bg-red-950/5"
    }
    else if (event.type === "CONTEXT_SNAPSHOT") {
        borderIndentStyle = "border-l-4 border-l-purple-500 pl-3 bg-purple-950/5"
    }

    return (
        <div className="flex flex-col mb-1.5">
            {/* <div>{event.type === "TOOL_RESULT" ? "└─ " : ""}</div> */}
            <div
                id={`timeline-row-${event.id}`}
                onClick={() => onRowClick(event.id)}
                className={`w-full p-4 rounded-lg border border-transparent cursor-pointer transition-all duration-300 relative ${borderIndentStyle} ${isHighlighted
                    ? "bg-yellow-500/10 border-yellow-500/30 border-l-yellow-400 shadow-[inset_4px_0_0_rgba(234,179,8,1)]"
                    : "hover:bg-blue-900/20 hover:border-blue-800/30"
                    }`}
            >
                <div className="flex justify-between items-center mb-1.5">

                    <span className={`font-semibold text-sm uppercase tracking-wider ${isHighlighted ? "text-yellow-400" : "text-gray-200"
                        }`}>
                        {indentPrefix}{event.type} <span className="text-gray-500 text-xs normal-case tracking-normal ml-1">{event.seq ? `seq: ${event.seq}` : ""}</span>
                    </span>
                    <span className="text-[11px] text-gray-400 font-medium bg-black/30 px-2.5 py-1 rounded-full">
                        {newEventTimeString(event.timestamp)}
                    </span>

                </div>

                {/* Token Batch Rendering */}
                {event.type === "TOKEN_BATCH" && (
                    <div className="mt-1">
                        <div className="flex justify-between items-center text-sm text-gray-300">
                            <p>Streamed {event.tokenCount || 1} tokens ({event.duration?.toFixed(2) || "0.00"}s)</p>
                            <button
                                className="text-xs text-blue-400 underline"
                                onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                            >
                                {expanded ? "Collapse" : "Expand"}
                            </button>
                        </div>
                        {expanded && (
                            <p className="mt-2 text-xs bg-black/40 p-2 rounded text-gray-400 font-mono break-all whitespace-pre-wrap">
                                {event.text}
                            </p>
                        )}
                    </div>
                )}

                {/* Tool Call and Result  */}
                {(event.type === "TOOL_CALL" || event.type === "TOOL_RESULT") && (
                    <div className="mt-1 text-xs">
                        <p className="font-mono text-gray-300">call_id: {event.call_id}</p>
                        {event.tool_name && <p className="text-blue-300 font-bold">Tool: {event.tool_name}</p>}
                        <pre className="mt-1 bg-black/40 p-1 rounded overflow-x-auto text-[10px] text-gray-400">
                            {JSON.stringify(event.details)}
                        </pre>
                    </div>
                )}

                {/*  for CONTEXT_SNAPSHOT */}
                {event.type === "CONTEXT_SNAPSHOT" && (
                    <div className="mt-1 text-xs text-purple-300">
                        <p className="font-semibold mb-1">Received Context Snapshot:</p>
                        <pre className="bg-black/40 p-1 rounded overflow-x-auto text-[10px] text-gray-400 max-h-20">
                            {JSON.stringify(event.details)}
                        </pre>
                    </div>
                )}

                {/*  for PING_PONG */}
                {event.type === "PING_PONG" && (
                    <div className="mt-1 text-xs text-gray-500 font-mono">
                        challenge: {event.details?.challenge} ⇆ echo: {event.details?.challenge}
                    </div>
                )}

                {/*  for ERROR */}
                {event.type === "ERROR" && (
                    <div className="mt-1 text-xs text-red-400">
                        <p className="font-bold">Error Event:</p>
                        <p className="font-mono">{JSON.stringify(event.details)}</p>
                    </div>
                )}
            </div>
        </div>
    )
})

function newEventTimeString(timestamp: number) {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
