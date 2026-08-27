export const CacheService = (() => {
    return {
        setItem: (key, val) => {
            localStorage.setItem(key, JSON.stringify(val));
        },
        getItem: (item) => {
            return JSON.parse(JSON.parse(localStorage.getItem(item)));
        },
        removeItem: (item) => {
            localStorage.removeItem(item);
        }
    }
})();
