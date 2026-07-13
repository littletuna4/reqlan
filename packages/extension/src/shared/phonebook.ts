/**
 * Phonebook access for the extension host — canonical data in reqlan rq/phonebook.json.
 * per ["../../../../reqlan rq/phonebook.rq"]
 */
import phonebookData from '../../../../reqlan rq/phonebook.json' with { type: 'json' };

export type PhonebookLinkId = keyof typeof phonebookData.links;

export function getPhonebookLink<const Id extends PhonebookLinkId>(id: Id) {
    const link = phonebookData.links[id];
    return { id, label: link.label, href: link.href };
}
