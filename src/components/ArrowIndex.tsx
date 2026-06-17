import React from "react";

interface ArrowIndexProps {
    maxIndex: number
    activeSnapIndex: number
    setActiveSnapIndex: React.Dispatch<React.SetStateAction<number>>
}

const ArrowIndex = React.memo(({ maxIndex, activeSnapIndex, setActiveSnapIndex }: ArrowIndexProps) => {

    const leftHandle = () => {
        if (activeSnapIndex > 0) {
            setActiveSnapIndex((prev: number) => prev - 1)
        }
    }

    const rightHandle = () => {
        if (activeSnapIndex < maxIndex - 1) {
            setActiveSnapIndex((prev: number) => prev + 1)
        }
    }

    const startIndex = Math.floor(activeSnapIndex / 3) * 3

    const visiblePages = Array.from(
        {
            length: Math.min(3, maxIndex - startIndex),
        },
        (_, i) => startIndex + i
    )

    return (
        <div className="flex flex-row items-center justify-center gap-3 my-2">
            <button
                className="w-8 h-8 rounded-md bg-blue-900/30 hover:bg-blue-800/60 text-blue-300 flex items-center justify-center cursor-pointer transition-colors shadow-sm disabled:opacity-30 disabled:cursor-not-allowed"
                onClick={leftHandle}
                disabled={activeSnapIndex === 0}
            >
                <span className="text-xl leading-none -mt-1">‹</span>
            </button>

            <div className="flex flex-row gap-2">
                {visiblePages.map((item) => (
                    <div
                        key={item}
                        onClick={() => setActiveSnapIndex(item)}
                        className={`w-8 h-8 rounded-md flex items-center justify-center cursor-pointer text-sm font-semibold transition-all
              ${item === activeSnapIndex
                                ? "bg-blue-500 text-white shadow-md shadow-blue-500/20"
                                : "bg-blue-900/20 text-blue-300 hover:bg-blue-800/40"
                            }`}
                    >
                        {item + 1}
                    </div>
                ))}
            </div>

            <button
                className="w-8 h-8 rounded-md bg-blue-900/30 hover:bg-blue-800/60 text-blue-300 flex items-center justify-center cursor-pointer transition-colors shadow-sm disabled:opacity-30 disabled:cursor-not-allowed"
                onClick={rightHandle}
                disabled={activeSnapIndex >= maxIndex - 1}
            >
                <span className="text-xl leading-none -mt-1">›</span>
            </button>
        </div>
    );
});

export default ArrowIndex;