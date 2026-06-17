import { DiffNode } from "@/types/type";
import React, { useState } from "react";

export interface DiffTreeNode {
    key: string,
    node: DiffNode,
    depth: number

}

function DiffTreeNode({ key, node, depth }: DiffTreeNode) {
    const [isExpanded, setIsExpanded] = useState<Boolean>(false)
    let statusStyle = ""
    let statusSymbol = ""
    switch (node.status) {
        case "added":
            statusStyle = "text-green-500"
            statusSymbol = "+"
            break
        case "removed":
            statusStyle = "text-red-500"
            statusSymbol = "-"
            break
        case "changed":
            statusStyle = "text-blue-500"
            statusSymbol = "~"
            break
        case "unchanged":
            statusStyle = "text-gray-500"
            statusSymbol = "-"
            break
    }
    // primitive row
    if (node.isPrimitive) {
        return (
            <div className={`flex items-center py-1 px-2 rounded hover:bg-white/5 transition-colors ${statusStyle}`}>
                <span className="font-mono opacity-50 mr-2 w-3 text-center">{statusSymbol}</span>
                <span className="font-semibold text-blue-300 mr-2 text-sm">{node.key}:</span>

                {node.status === "changed" ? (
                    <span className="flex items-center gap-1.5">
                        <span className="text-red-400 line-through text-xs">{String(node.oldValue)}</span>
                        <span className="text-gray-500 text-xs">→</span>
                        <span className="text-yellow-400 font-semibold text-sm">{String(node.value)}</span>
                    </span>
                ) : (
                    <span className="text-gray-200 text-sm">{String(node.value ?? "null")}</span>
                )}
            </div>
        )
    }

    // Object/Array Row
    return (
        <div className="flex flex-col py-0.5">
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                className={`flex items-center py-1 px-2 rounded hover:bg-white/5 cursor-pointer select-none ${statusStyle}`}
            >
                <span className="font-mono opacity-50 mr-2 w-3 text-center">{statusSymbol}</span>
                <span className="text-[10px] text-gray-400 mr-2 w-3 text-center transition-transform">{isExpanded ? "▼" : "▶"}</span>
                <span className="font-semibold text-blue-300 mr-1 text-sm">{node.key}:</span>
                <span className="text-xs text-gray-500 font-mono">{"{...}"}</span>
            </div>

            {/* render sub-children if expanded is checked */}
            {isExpanded && node.children && (
                <div className="flex flex-col mt-0.5 ml-5 border-l border-white/10 pl-2">
                    {node.children.map((child) => (
                        <DiffTreeNode
                            key={child.key}
                            node={child}
                            depth={depth + 1}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
export default React.memo(DiffTreeNode)