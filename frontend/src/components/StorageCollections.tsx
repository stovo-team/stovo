import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Folder, Image, LockKeyhole, Music2, Plus, Trash2, Users, X } from "lucide-react";

import type { User } from "../api/auth";
import { getChats, sendCollectionMessage, type Chat } from "../api/chats";
import { getMembers, getServerRoles, type ServerRole } from "../api/family";
import { uploadFile, type FamilyFile } from "../api/files";
import {
  addCollectionItem, createCollection, deleteCollection, deleteCollectionGrant, getCollectionGrants,
  getCollectionItems, getCollections, removeCollectionItem, saveCollectionGrant, updateCollection,
  type CollectionAccessLevel, type CollectionContentType, type CollectionGrant, type CollectionKind, type StorageCollection
} from "../api/collections";
import useFilePreviewUrl from "../hooks/useFilePreviewUrl";

function collectionMatchesFilter(collection: StorageCollection, filter: string) {
  if (filter === "all" || filter === "favorites") return true;
  if (filter === "audio") return collection.contentType === "audio";
  if (filter === "documents") return collection.displayKind === "folder" || collection.contentType === "documents";
  return collection.contentType === "media";
}

function CollectionCard({ collection, accessToken, coverFile, onOpen }: { collection: StorageCollection; accessToken: string; coverFile: FamilyFile | null; onOpen: () => void }) {
  const cover = useFilePreviewUrl(accessToken, coverFile, Boolean(coverFile));
  const Icon = collection.contentType === "audio" ? Music2 : collection.displayKind === "album" ? Image : Folder;
  return <button type="button" className="storage-collection-card" onClick={onOpen}>
    <span className="storage-collection-cover">{cover ? <img src={cover} alt="" /> : <Icon aria-hidden="true" size={25} />}</span>
    <span><strong>{collection.title}</strong><small>{collection.itemCount} {collection.itemCount === 1 ? "item" : "items"} · {collection.displayKind}</small></span>
    {collection.accessLevel === "viewer" && <LockKeyhole aria-label="View only" size={15} />}
  </button>;
}

export function StorageCollections({ accessToken, files, filter, onFilesChanged }: { accessToken: string | null; files: FamilyFile[]; filter: string; onFilesChanged?: () => void }) {
  const [collections, setCollections] = useState<StorageCollection[]>([]);
  const [selected, setSelected] = useState<StorageCollection | null>(null);
  const [items, setItems] = useState<FamilyFile[]>([]);
  const [grants, setGrants] = useState<CollectionGrant[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [roles, setRoles] = useState<ServerRole[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<CollectionKind>("folder");
  const [contentType, setContentType] = useState<CollectionContentType>("mixed");
  const [grantTarget, setGrantTarget] = useState("");
  const [grantLevel, setGrantLevel] = useState<CollectionAccessLevel>("viewer");
  const [shareChatId, setShareChatId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const openedRequestedCollectionRef = useRef(false);
  const requestedCollectionId = useMemo(() => new URLSearchParams(window.location.search).get("collection"), []);

  const load = async () => { if (!accessToken) return; setCollections(await getCollections(accessToken)); };
  useEffect(() => { void load().catch(() => setError("Could not load folders and albums")); }, [accessToken]);
  useEffect(() => { if (!accessToken) return; void Promise.all([getMembers(accessToken), getServerRoles(accessToken)]).then(([nextMembers, nextRoles]) => { setMembers(nextMembers); setRoles(nextRoles); }).catch(() => undefined); }, [accessToken]);
  useEffect(() => { if (!accessToken) return; void getChats(accessToken).then(setChats).catch(() => undefined); }, [accessToken]);
  const visible = useMemo(() => collections.filter((collection) => collectionMatchesFilter(collection, filter)), [collections, filter]);
  const label = filter === "audio" ? "Audio albums" : filter === "documents" ? "Folders" : filter === "photos" || filter === "videos" ? "Albums" : "Folders & albums";
  const open = async (collection: StorageCollection) => { if (!accessToken) return; setSelected(collection); setError(null); try { const [nextItems, nextGrants] = await Promise.all([getCollectionItems(accessToken, collection.id), collection.accessLevel === "editor" ? getCollectionGrants(accessToken, collection.id) : Promise.resolve([])]); setItems(nextItems); setGrants(nextGrants); } catch { setError("Could not open this collection"); } };
  useEffect(() => { const requested = requestedCollectionId ? collections.find((collection) => collection.id === requestedCollectionId) : null; if (!requested || openedRequestedCollectionRef.current) return; openedRequestedCollectionRef.current = true; void open(requested); }, [collections, requestedCollectionId]);
  const create = async () => { if (!accessToken || !title.trim()) return; try { const created = await createCollection(accessToken, { title: title.trim(), displayKind: kind, contentType }); setCollections((current) => [created, ...current]); setCreating(false); setTitle(""); await open(created); } catch { setError("Could not create collection"); } };
  const addItem = async (fileId: string, makePrivate = false) => { if (!accessToken || !selected) return; try { const file = await addCollectionItem(accessToken, selected.id, fileId, makePrivate); setItems((current) => [file, ...current.filter((item) => item.id !== file.id)]); setCollections((current) => current.map((c) => c.id === selected.id ? { ...c, itemCount: c.itemCount + (items.some((item) => item.id === file.id) ? 0 : 1), updatedAt: new Date().toISOString() } : c)); onFilesChanged?.(); } catch { setError("Could not add file to collection"); } };
  const removeItem = async (fileId: string) => { if (!accessToken || !selected) return; try { await removeCollectionItem(accessToken, selected.id, fileId); setItems((current) => current.filter((item) => item.id !== fileId)); setCollections((current) => current.map((c) => c.id === selected.id ? { ...c, itemCount: Math.max(0, c.itemCount - 1) } : c)); } catch { setError("Could not remove file"); } };
  const saveGrant = async () => { if (!accessToken || !selected || !grantTarget) return; const [principalType, principalId] = grantTarget.split(":") as ["user" | "role", string]; try { const grant = await saveCollectionGrant(accessToken, selected.id, { principalType, principalId, accessLevel: grantLevel }); setGrants((current) => [...current.filter((item) => !(item.principalType === grant.principalType && item.principalId === grant.principalId)), grant]); setGrantTarget(""); } catch { setError("Could not update collection access"); } };
  const changeTitle = async () => { if (!accessToken || !selected || !title.trim()) return; try { const updated = await updateCollection(accessToken, selected.id, { title: title.trim() }); setSelected(updated); setCollections((current) => current.map((item) => item.id === updated.id ? updated : item)); setTitle(""); } catch { setError("Could not rename collection"); } };
  const setCover = async (fileId: string) => { if (!accessToken || !selected) return; try { const updated = await updateCollection(accessToken, selected.id, { coverFileId: fileId || null }); setSelected(updated); setCollections((current) => current.map((item) => item.id === updated.id ? updated : item)); } catch { setError("Could not update collection cover"); } };
  const onUpload = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file || !selected || !accessToken) return; try { const uploaded = await uploadFile(accessToken, file); await addItem(uploaded.id, true); } catch { setError("Could not upload file to collection"); } };
  const shareToChat = async () => { if (!accessToken || !selected || !shareChatId) return; try { await sendCollectionMessage(accessToken, shareChatId, selected.id); setShareChatId(""); } catch { setError("Could not share collection to chat"); } };
  if (!accessToken) return null;
  return <section className="storage-collections" aria-label={label}>
    <div className="storage-collections-heading"><div><h2>{label}</h2><p>Protected, flat collections for files from across Storage.</p></div><button type="button" className="storage-collection-new" onClick={() => { setCreating(true); setError(null); }}><Plus size={17} /> New</button></div>
    {visible.length > 0 && <div className="storage-collections-row">{visible.map((collection) => <CollectionCard key={collection.id} collection={collection} accessToken={accessToken} coverFile={files.find((file) => file.id === collection.coverFileId) ?? null} onOpen={() => void open(collection)} />)}</div>}
    {creating && <div className="modal-backdrop" role="presentation"><div className="messenger-modal storage-collection-dialog" role="dialog" aria-modal="true" aria-label="New collection"><button className="storage-collection-close" type="button" aria-label="Close" onClick={() => setCreating(false)}><X size={19} /></button><h2>New folder or album</h2><label>Title<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Display<select value={kind} onChange={(event) => setKind(event.target.value as CollectionKind)}><option value="folder">Folder</option><option value="album">Album</option></select></label><label>Contents<select value={contentType} onChange={(event) => setContentType(event.target.value as CollectionContentType)}><option value="mixed">Mixed files</option><option value="media">Photos & videos</option><option value="audio">Audio</option><option value="documents">Documents</option></select></label><button type="button" className="primary-button" onClick={() => void create()}>Create protected collection</button></div></div>}
    {selected && <div className="modal-backdrop" role="presentation"><div className="messenger-modal storage-collection-dialog storage-collection-detail" role="dialog" aria-modal="true" aria-label={selected.title}><button className="storage-collection-close" type="button" aria-label="Close" onClick={() => { setSelected(null); setTitle(""); }}><X size={19} /></button><header><span>{selected.displayKind === "album" ? <Image size={22} /> : <Folder size={22} />}</span><div><h2>{selected.title}</h2><p>{selected.itemCount} items · {selected.accessLevel}</p></div></header>{selected.accessLevel === "editor" && <div className="storage-collection-controls"><input placeholder="Rename collection" value={title} onChange={(event) => setTitle(event.target.value)} /><button type="button" onClick={() => void changeTitle()}>Rename</button><button type="button" onClick={() => uploadRef.current?.click()}>Upload</button><input className="visually-hidden" ref={uploadRef} type="file" onChange={onUpload} /></div>}
      <div className="storage-collection-items">{items.map((file) => <article key={file.id}><span>{file.originalName}</span>{selected.accessLevel === "editor" && <button type="button" onClick={() => void removeItem(file.id)}>Remove</button>}</article>)}{items.length===0&&<p>No files yet.</p>}</div>
      {selected.accessLevel === "editor" && <><label className="storage-collection-add">Add an existing file<select defaultValue="" onChange={(event) => { if (event.target.value) void addItem(event.target.value); event.target.value=""; }}><option value="" disabled>Select a file</option>{files.filter((file) => !items.some((item) => item.id === file.id)).map((file) => <option key={file.id} value={file.id}>{file.originalName}</option>)}</select></label><label className="storage-collection-add">Cover<select value={selected.coverFileId ?? ""} onChange={(event) => void setCover(event.target.value)}><option value="">No cover</option>{items.map((file) => <option key={file.id} value={file.id}>{file.originalName}</option>)}</select></label><section className="storage-collection-sharing"><h3><Users size={17} /> Access</h3>{grants.map((grant) => <div key={`${grant.principalType}:${grant.principalId}`}><span>{grant.principalType === "user" ? members.find((member) => member.id === grant.principalId)?.displayName ?? "Member" : roles.find((role) => role.id === grant.principalId)?.name ?? "Role"} · {grant.accessLevel}</span><button type="button" onClick={() => void deleteCollectionGrant(accessToken, selected.id, grant).then(() => setGrants((current) => current.filter((item) => item !== grant))).catch(() => setError("Could not remove access"))}>Remove</button></div>)}<div className="storage-collection-grant"><select value={grantTarget} onChange={(event) => setGrantTarget(event.target.value)}><option value="">Add person or role</option>{members.map((member) => <option key={`u:${member.id}`} value={`user:${member.id}`}>{member.displayName}</option>)}{roles.map((role) => <option key={`r:${role.id}`} value={`role:${role.id}`}>Role: {role.name}</option>)}</select><select value={grantLevel} onChange={(event) => setGrantLevel(event.target.value as CollectionAccessLevel)}><option value="viewer">Viewer</option><option value="editor">Editor</option></select><button type="button" onClick={() => void saveGrant()}>Grant</button></div></section><section className="storage-collection-sharing"><h3>Share in chat</h3><div className="storage-collection-grant"><select value={shareChatId} onChange={(event) => setShareChatId(event.target.value)}><option value="">Choose chat</option>{chats.filter((chat) => chat.type !== "archive").map((chat) => <option key={chat.id} value={chat.id}>{chat.title ?? "Direct chat"}</option>)}</select><button type="button" onClick={() => void shareToChat()}>Send card</button></div></section><button type="button" className="storage-collection-delete" onClick={() => void deleteCollection(accessToken, selected.id).then(() => { setCollections((current) => current.filter((item) => item.id !== selected.id)); setSelected(null); }).catch(() => setError("Could not delete collection"))}><Trash2 size={16}/> Delete collection</button></>}</div></div>}
    {error && <p className="error-text storage-collection-error">{error}</p>}
  </section>;
}
