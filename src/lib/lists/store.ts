/** List operations against this device's storage. The rules are in lists.ts (pure, tested). */
import { deleteListEntry, deleteUserList, listEntries, saveListEntry, saveUserList, userLists, type ListEntry, type UserList } from '../storage/db';
import { newId } from '../id';
import { MY_LIST_ID, findEntry, planAdd, planDeleteList, planRemove, type NewItem } from './lists';

export const MY_LIST_NAME = 'My list';

/** The user's lists, My list first (it exists even before anything is saved). */
export async function loadUserLists(): Promise<UserList[]> {
  const saved = await userLists();
  const mine = saved.find((l) => l.id === MY_LIST_ID) ?? { id: MY_LIST_ID, name: MY_LIST_NAME, createdAt: 0 };
  return [mine, ...saved.filter((l) => l.id !== MY_LIST_ID).sort((a, b) => a.createdAt - b.createdAt)];
}

export async function createList(name: string): Promise<UserList> {
  const list = { id: newId('list-'), name: name.trim(), createdAt: Date.now() };
  await saveUserList(list);
  return list;
}

export async function renameList(list: UserList, name: string): Promise<void> {
  await saveUserList({ ...list, name: name.trim() });
}

/** Deletes a list. Problems in it keep their progress if they have any. */
export async function deleteList(listId: string): Promise<void> {
  if (listId === MY_LIST_ID) throw new Error('My list can’t be deleted');
  const plan = planDeleteList(await listEntries(), listId);
  await Promise.all([...plan.save.map(saveListEntry), ...plan.remove.map(deleteListEntry)]);
  await deleteUserList(listId);
}

/** Adds problems to a list; ones already in it are skipped. */
export async function addToList(listId: string, items: NewItem[]): Promise<{ added: number; alreadyThere: number }> {
  const plan = planAdd(await listEntries(), items, listId, Date.now(), () => newId('l-'));
  await Promise.all(plan.save.map(saveListEntry));
  return { added: plan.added, alreadyThere: plan.alreadyThere };
}

export async function removeFromList(entry: ListEntry, listId: string): Promise<void> {
  const plan = planRemove(entry, listId);
  if (plan.save) await saveListEntry(plan.save);
  if (plan.remove) await deleteListEntry(plan.remove);
}

/**
 * The entry that records progress on a problem, created (in no list) if
 * the user practices something from a bundled list for the first time.
 */
export async function entryForPractice(item: NewItem): Promise<ListEntry> {
  const existing = findEntry(await listEntries(), item);
  if (existing) return existing;
  const entry: ListEntry = { id: newId('l-'), title: item.title, link: item.link, slug: item.slug, text: item.text, addedAt: Date.now(), sessions: [], lists: [] };
  await saveListEntry(entry);
  return entry;
}
