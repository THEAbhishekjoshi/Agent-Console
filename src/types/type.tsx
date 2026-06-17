export interface ToolBlock {
    type: 'tool';
    call_id: string;
    tool_name: string;
    args: Record<string, any>;
    result?: Record<string, any>;
    status: 'pending' | 'completed';
}

export interface TextBlock {
    type: 'text';
    text: string;
}

export type MessageBlock = TextBlock | ToolBlock;

export interface ChatMessage {
    id: string;
    sender: 'user' | 'agent';
    stream_id?: string;
    blocks: MessageBlock[]; // text and tools
}

export interface TraceEvent {
    id: string;
    seq?: number;
    type: "TOKEN_BATCH" | "TOOL_CALL" | "TOOL_RESULT" | "CONTEXT_SNAPSHOT" | "PING_PONG" | "ERROR";
    timestamp: number;
    // Specific payloads depending on type
    stream_id?: string
    call_id?: string;
    tool_name?: string;
    text?: string;
    tokenCount?: number;
    duration?: number;
    details?: any;
}


export type StreamState = "idle" | "streaming" | "completed" | "error" | "showing_tool_card" | "showing_tool_result"
export type FilterType = "ALL" | "TOKEN_BATCH" | "TOOL_CALL" | "TOOL_RESULT" | "CONTEXT_SNAPSHOT" | "PING_PONG" | "ERROR"

export type DiffStatus = 'added' | 'removed' | 'changed' | 'unchanged';

export interface DiffNode {
    key: string;
    status: DiffStatus;
    isPrimitive: boolean;
    value?: any;        //  New/current value
    oldValue?: any;
    children?: DiffNode[]; // Nested properties (used if object or array)
}
