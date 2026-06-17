import { DiffNode } from "@/types/type"

const isPrimitiveValue = (val: any): boolean => {
    return val === null || typeof val !== "object"
}
const diffObjects = (obj1: any, obj2: any): DiffNode[] => {
    const diff: DiffNode[] = []

    const o1 = obj1 || {}
    const o2 = obj2 || {}

    const allkeys = Array.from(new Set([...Object.keys(o1), ...Object.keys(o2)]))

    allkeys.forEach(key => {
        const val1 = o1[key]
        const val2 = o2[key]

        if (val1 !== undefined && val2 === undefined) {
            diff.push({
                key,
                status: "removed",
                isPrimitive: isPrimitiveValue(val1),
                oldValue: val1,
                children: !isPrimitiveValue(val1) ? diffObjects(val1, {}) : undefined
            })
            return
        }
        else if (val1 === undefined && val2 !== undefined) {
            diff.push({
                key,
                status: "added",
                isPrimitive: isPrimitiveValue(val2),
                value: val2,
                children: !isPrimitiveValue(val2) ? diffObjects({}, val2) : undefined
            })
            return
        }
        else {
            // Both are primitives
            if (isPrimitiveValue(val1) && isPrimitiveValue(val2)) {
                if (val1 === val2) {
                    diff.push({
                        key,
                        status: "unchanged",
                        isPrimitive: true,
                        value: val1
                    })
                }
                else if (val1 != val2) {
                    diff.push({
                        key,
                        status: "changed",
                        isPrimitive: true,
                        value: val2,
                        oldValue: val1
                    })
                }
                return
            }
            // Both are nested objects
            if (!isPrimitiveValue(val1) && !isPrimitiveValue(val2)) {
                const nestedDiff = diffObjects(val1, val2)
                const hasChanges = nestedDiff.some(child => child.status !== "unchanged")
                diff.push({
                    key,
                    status: hasChanges ? "changed" : "unchanged",
                    isPrimitive: false,
                    children: nestedDiff,

                })
                return
            }

            diff.push({
                key,
                status: "changed",
                isPrimitive: false,
                value: isPrimitiveValue(val2) ? val2 : undefined,
                oldValue: !isPrimitiveValue(val1) ? val1 : undefined,
                children: isPrimitiveValue(val1) ? diffObjects({}, val2) : undefined
            })
        }

    })

    return diff
}
export default diffObjects