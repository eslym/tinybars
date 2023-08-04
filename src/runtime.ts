const tags: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
};

export default function escapeHTML(str: string) {
    return str.replace(/[&<>'"]/g, (tag) => (tag in tags ? tags[tag] : tag));
}
