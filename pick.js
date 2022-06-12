function get(object, path) {
    const fields = Array.isArray(path) ? path : path.split('.')
    let cursor = object

    for (let i = 0; i < fields.length; i++) {
        if (fields[i] === '*') {
            // TODO: validation of cursor being an array
            const newPath = fields.slice(i + 1)
            return cursor.map(item => get(item, newPath))
        } else {
            cursor = cursor[fields[i]]
        }
    }

    return cursor
}

function set(object, path, value) {
    const fields = Array.isArray(path) ? path : path.split('.')
    let cursor = object
    let prevCursor

    for (let i = 0; i < fields.length - 1; i++) {
        const field = fields[i]

        if (field === '*') {
            const newPath = fields.slice(i + 1)
            // TODO: validation of value being an array
            const newValue = value.map((val, index) => set(cursor[index] || {}, newPath, val))

            if (i > 0) {
                prevCursor[fields[i - 1]] = newValue
            } else {
                return newValue
            }

            return object
        } else {
            prevCursor = cursor
            cursor = cursor[field] = cursor[field] || {}
        }
    }

    const lastField = fields[fields.length - 1]
    if (Array.isArray(cursor)) {
        cursor.forEach(item => item[lastField] = value)
    } else {
        cursor[lastField] = value
    }

    return object
}

function pick(object, paths) {
    return paths.reduce((slice, path) => {
        const value = get(object, path)

        if (typeof value !== 'undefined') {
            set(slice, path, value)
        }

        return slice
    }, {})
}

module.exports = { get, set, pick };