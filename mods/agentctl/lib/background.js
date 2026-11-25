// How a background record reads to a person (agentctl-background-status spec § 3.3, § 3.4). Pure: it
// says what was observed, from where and when, and never that work is done, running now or stuck.

import { sanitize } from './sanitize.js'

const ENDS = ['completed', 'failed', 'killed', 'cancelled']

// One word table for both closing paths. An unlisted word is unknown: neither an end nor a sighting.
export function statusKind(word) {
  if (ENDS.includes(word)) return 'end'
  return word === 'working' ? 'working' : 'unknown'
}

const ended = (rec) => ENDS.includes(rec.status)

// Open: no observed end, or the host named it again after the end it reported.
export function isOpen(rec) {
  return !ended(rec) || rec.seenAgainAt !== undefined
}

export function openCount(state) {
  return Object.values(state.background ?? {}).filter(isOpen).length
}

// The latest Stop list: its ids, and the ids with newer evidence than it. `missingAt` is set only while
// the latest Stop carried no list. A state saved before this was kept has only times: a later list that
// named another id shows absence, but equal times do not show one list, so presence in the latest stays
// unknown (read as if no later list was supplied).
function latestList(state) {
  const rows = Object.entries(state.background ?? {}).filter(([, r]) => r.asOf !== undefined)
  if (state.bgList?.ids) return state.bgList
  if (!rows.length) return { ...state.bgList, ids: null, later: [] }
  const at = Math.max(...rows.map(([, r]) => r.asOf))
  const later = Object.entries(state.background).filter(([, r]) => r.asOf === undefined && r.since >= at).map(([id]) => id)
  return { ...state.bgList, suppliedAt: at, missingAt: state.bgList?.missingAt ?? at, ids: rows.filter(([, r]) => r.asOf === at).map(([id]) => id), later }
}

const requestedOf = (rec, state) => (rec.opId && state.ops?.[rec.opId]?.requested) || ''

function labelOf(id, requested) {
  const key = sanitize(id, 60)
  return requested ? `${sanitize(requested, 60)} (${key})` : key
}

export function backgroundItems(state, contextAt) {
  const list = latestList(state)
  const items = []
  for (const [id, rec] of Object.entries(state.background ?? {})) {
    if (!isOpen(rec) && !rec.conflict) continue
    const lastSeen = Math.max(rec.since ?? 0, rec.asOf ?? 0, rec.queriedAt ?? 0, rec.wordAt ?? 0, rec.seenAgainAt ?? 0, rec.endedAt ?? 0, rec.conflict?.at ?? 0)
    const inList = Boolean(list.ids?.includes(id))
    const left = Boolean(list.ids) && !inList && !list.later.includes(id)
    let reading
    if (rec.conflict && rec.seenAgainAt === undefined) reading = 'conflict'
    else if (rec.word !== undefined) reading = 'unknown-word'
    else if (left) reading = 'left-list'
    // Named again after its end, with nothing newer: that sighting is the reading.
    else if (ended(rec)) reading = 'seen-again'
    else if (rec.queriedAt !== undefined) reading = 'working'
    else if (inList && list.missingAt === undefined) reading = 'listed'
    else if (rec.asOf !== undefined) reading = 'list-unknown'
    else reading = 'started'
    // Nothing of a record from an earlier load (or written by a version that did not keep this) has
    // been seen since this one started, whatever it last read as.
    const before = contextAt !== undefined && rec.ctx !== contextAt && reading !== 'conflict'
    const requested = requestedOf(rec, state)
    items.push({ id, requested, label: labelOf(id, requested), reading: before ? 'before-reload' : reading, was: reading, rec, left, lastSeen, suppliedAt: list.suppliedAt })
  }
  return items
}

const firstWord = (rec) => (rec.opId ? 'started' : 'first seen')

// `when` turns a time into words: an age in the status, an ISO time in the hand-over.
export function describeItem(item, when) {
  const text = describeAs(item.was, item, when)
  return item.reading === 'before-reload' ? `${text}; from before this session was loaded, not seen since` : text
}

function describeAs(reading, { rec, left, suppliedAt }, when) {
  // An end and the sighting after it stay visible as history under whatever was observed since.
  const again = ended(rec) && rec.seenAgainAt !== undefined ? `, ended ${rec.status} ${when(rec.endedAt)}, named again by the host ${when(rec.seenAgainAt)}` : ''
  const origin = `${firstWord(rec)} ${when(rec.since)}${again}`
  const seen = rec.asOf !== undefined ? `, last listed ${when(rec.asOf)}` : ''
  const gone = left ? `, not in the host list of ${when(suppliedAt)}` : ''
  switch (reading) {
    case 'listed': return `listed by the host ${when(rec.asOf)} (Stop event); ${origin}`
    case 'working': return `reported working by the host ${when(rec.queriedAt)} (${rec.queriedVia ?? 'source not kept'}); ${origin}`
    case 'left-list': return `${origin}${seen}${gone}; completion unobserved`
    case 'list-unknown': return `${origin}${seen}; whether it was listed since is unknown; completion unobserved`
    case 'unknown-word': return `${origin}${gone}; host status word not known here: "${sanitize(rec.word, 40)}" ${when(rec.wordAt)}; not an end`
    case 'conflict': return `conflicting ends: ${rec.status} ${when(rec.endedAt)}, ${rec.conflict.status} ${when(rec.conflict.at)}`
    case 'seen-again': return `ended ${rec.status} ${when(rec.endedAt)}, named again by the host ${when(rec.seenAgainAt)}`
    default: return `${origin} (tool result); completion unobserved`
  }
}

const HOST_NAMED = ['listed', 'working', 'seen-again']

export function age(now) {
  return (at) => {
    if (at === undefined) return 'at an unknown time'
    const s = Math.max(0, Math.round((now - at) / 1000))
    return s < 120 ? `${s}s ago` : s < 7200 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`
  }
}

// At most two lines, whatever is open: what the host named, and what has no observed end.
export function compactLines(state, now, contextAt, quiet) {
  const items = backgroundItems(state, contextAt)
  const when = age(now)
  const named = items.filter((i) => HOST_NAMED.includes(i.reading))
  const rest = items.filter((i) => !HOST_NAMED.includes(i.reading))
  const names = (xs) => `${xs.slice(0, 3).map((i) => i.label).join(', ')}${xs.length > 3 ? `, +${xs.length - 3} more` : ''}`
  const lines = []
  const stall = quiet && openCount(state) ? ' · stall not evaluated while work is open' : ''
  if (named.length) lines.push(`Background named by the host, newest ${when(Math.max(...named.map((i) => i.lastSeen)))}: ${named.length} — ${names(named)}${rest.length ? '' : stall}`)
  if (rest.length) {
    const conflicts = rest.filter((i) => i.reading === 'conflict').length
    const unseen = rest.length - conflicts
    const parts = []
    if (unseen) parts.push(`${unseen} with completion unobserved`)
    if (conflicts) parts.push(`${conflicts} with conflicting ends`)
    lines.push(`Background: ${parts.join(', ')}, oldest evidence ${when(Math.min(...rest.map((i) => i.lastSeen)))} — ${names(rest)}${stall}`)
  }
  return lines
}

export function detailLines(state, now, contextAt) {
  const items = backgroundItems(state, contextAt)
  if (!items.length) return ['Background: nothing observed; untracked work cannot be confirmed either way']
  const when = age(now)
  return ['Background items:', ...items.map((i) => `  ${i.label}: ${describeItem(i, when)}`)]
}
