import { t } from '../utils/i18n.js';
import { settings } from './settings.svelte.js';

export interface Tab {
	id: string;
	path: string;
	title: string;
	content: string;
	rawContent: string;
	originalContent: string;
	scrollTop: number;
	isDirty: boolean;
	isEditing: boolean;
	history: string[];
	historyIndex: number;
	editorViewState: any; // monaco.editor.ICodeEditorViewState | null
	scrollPercentage: number;
	anchorLine: number;
	isSplit: boolean;
	splitRatio: number;
	isScrollSynced: boolean;
	hasPendingDiff: boolean;
	groupId?: string;
}

export interface TabGroup {
	id: string;
	name: string;
	color: string;
	collapsed: boolean;
}

// A drop lands relative to the row directly above it; the dragged tab inherits
// that row's group. Membership is thus a consequence of position — no separate
// contiguity invariant to maintain.
export type DropAnchor =
	| { kind: 'top' }
	| { kind: 'tab'; id: string }
	| { kind: 'header'; groupId: string };

const GROUP_COLORS = ['#4c8bf5', '#e0616e', '#e0a34c', '#5bbf6a', '#a06ee0', '#4cc0d0', '#d06ea0', '#8a94a6'];

class TabManager {
	tabs = $state<Tab[]>([]);
	groups = $state<TabGroup[]>([]);
	activeTabId = $state<string | null>(null);
	splitScrollSyncPreference = $state(false);

	constructor() {
		if (typeof localStorage !== 'undefined') {
			const saved = localStorage.getItem('editor.splitScrollSync');
			if (saved !== null) {
				this.splitScrollSyncPreference = saved === 'true';
			}
		}
	}

	private saveSplitScrollSyncPreference() {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('editor.splitScrollSync', String(this.splitScrollSyncPreference));
		}
	}

	get activeTab() {
		return this.tabs.find((t) => t.id === this.activeTabId);
	}

	serializeState(): string {
		const stateData = {
			activeTabId: this.activeTabId,
			groups: this.groups,
			tabs: this.tabs.map(t => ({ ...t, editorViewState: null, content: '' }))
		};
		return JSON.stringify(stateData);
	}

	restoreState(jsonBuffer: string) {
		try {
			const data = JSON.parse(jsonBuffer);
			if (data && Array.isArray(data.tabs)) {
				this.tabs = data.tabs;
				this.activeTabId = data.activeTabId;
				this.groups = Array.isArray(data.groups) ? data.groups : [];
			}
		} catch (e) {
			console.error('Failed to restore tab state', e);
		}
	}

	addTab(path: string, content: string = '') {
		const id = crypto.randomUUID();
		const filename = path.split('\\').pop()?.split('/').pop() || t('tabs.untitled', settings.language);

		this.tabs.push({
			id,
			path,
			title: filename,
			content,
			rawContent: content,
			originalContent: content,
			scrollTop: 0,
			isDirty: false,
			isEditing: false,
			history: [content],
			historyIndex: 0,
			editorViewState: null,
			scrollPercentage: 0,
			anchorLine: 0,
			isSplit: false,
			splitRatio: 0.5,
			isScrollSynced: false,
			hasPendingDiff: false
		});

		this.activeTabId = id;
	}

	addNewTab() {
		const id = crypto.randomUUID();
		const content = '';

		this.tabs.push({
			id,
			path: '',
			title: t('tabs.untitled', settings.language),
			content,
			rawContent: content,
			originalContent: content,
			scrollTop: 0,
			isDirty: false,
			isEditing: true,
			history: [content],
			historyIndex: 0,
			editorViewState: null,
			scrollPercentage: 0,
			anchorLine: 0,
			isSplit: false,
			splitRatio: 0.5,
			isScrollSynced: false,
			hasPendingDiff: false
		});

		this.activeTabId = id;
	}

	addHomeTab() {
		const homeTab = this.tabs.find(t => t.path === 'HOME');
		if (homeTab) {
			this.activeTabId = homeTab.id;
			return;
		}

		const id = crypto.randomUUID();
		this.tabs.push({
			id,
			path: 'HOME',
			title: t('tabs.home', settings.language),
			content: '',
			rawContent: '',
			originalContent: '',
			scrollTop: 0,
			isDirty: false,
			isEditing: false,
			history: [],
			historyIndex: 0,
			editorViewState: null,
			scrollPercentage: 0,
			anchorLine: 0,
			isSplit: false,
			splitRatio: 0.5,
			isScrollSynced: false,
			hasPendingDiff: false
		});

		this.activeTabId = id;
	}

	closeTab(id: string) {
		const index = this.tabs.findIndex((t) => t.id === id);
		if (index === -1) return;

		if (this.activeTabId === id) {
			const fallback = this.tabs[index + 1] || this.tabs[index - 1];
			this.activeTabId = fallback ? fallback.id : null;
		}

		const tab = this.tabs[index];
		if (tab.path && tab.path !== 'HOME') {
			this.recentlyClosed.push(tab.path);
		}
		const gid = tab.groupId;
		this.tabs.splice(index, 1);
		if (gid) this.cleanupGroup(gid);
	}

	closeAll() {
		this.tabs = [];
		this.activeTabId = null;
	}

	setActive(id: string) {
		this.activeTabId = id;
		const tab = this.tabs.find((t) => t.id === id);
		if (tab?.groupId) {
			const group = this.getGroup(tab.groupId);
			if (group?.collapsed) group.collapsed = false;
		}
	}

	updateTabContent(id: string, content: string) {
		const tab = this.tabs.find((t) => t.id === id);
		if (tab) {
			tab.content = content;
		}
	}

	updateTabRawContent(id: string, raw: string) {
		const tab = this.tabs.find((t) => t.id === id);
		if (tab) {
			tab.rawContent = raw;
			tab.isDirty = tab.rawContent !== tab.originalContent;
		}
	}

	setTabRawContent(id: string, raw: string) {
		const tab = this.tabs.find((t) => t.id === id);
		if (tab) {
			tab.rawContent = raw;
			tab.originalContent = raw;
			tab.isDirty = false;
			tab.hasPendingDiff = false;
		}
	}

	updateTabScroll(id: string, scrollTop: number) {
		const tab = this.tabs.find((t) => t.id === id);
		if (tab) {
			tab.scrollTop = scrollTop;
		}
	}

	updateTabEditorState(id: string, viewState: any) {
		const tab = this.tabs.find((t) => t.id === id);
		if (tab) {
			tab.editorViewState = viewState;
		}
	}

	updateTabScrollPercentage(id: string, percentage: number) {
		const tab = this.tabs.find((t) => t.id === id);
		if (tab) {
			tab.scrollPercentage = percentage;
		}
	}

	updateTabAnchorLine(id: string, line: number) {
		const tab = this.tabs.find((t) => t.id === id);
		if (tab) {
			tab.anchorLine = line;
		}
	}

	toggleSplit(id: string) {
		const tab = this.tabs.find((t) => t.id === id);
		if (tab) {
			this.setSplitEnabled(id, !tab.isSplit);
		}
	}

	setSplitEnabled(id: string, enabled: boolean) {
		const tab = this.tabs.find((t) => t.id === id);
		if (!tab) return;

		tab.isSplit = enabled;
		if (enabled) {
			tab.isScrollSynced = this.splitScrollSyncPreference;
		} else {
			this.splitScrollSyncPreference = tab.isScrollSynced;
			this.saveSplitScrollSyncPreference();
		}
	}

	setSplitRatio(id: string, ratio: number) {
		const tab = this.tabs.find((t) => t.id === id);
		if (tab) {
			tab.splitRatio = Math.max(0.1, Math.min(0.9, ratio));
		}
	}

	toggleScrollSync(id: string) {
		const tab = this.tabs.find((t) => t.id === id);
		if (tab) {
			tab.isScrollSynced = !tab.isScrollSynced;
			this.splitScrollSyncPreference = tab.isScrollSynced;
			this.saveSplitScrollSyncPreference();
		}
	}


	reorderTabs(fromIndex: number, toIndex: number) {
		if (fromIndex === toIndex) return;
		const [moved] = this.tabs.splice(fromIndex, 1);
		this.tabs.splice(toIndex, 0, moved);
	}

	getGroup(id: string) {
		return this.groups.find((g) => g.id === id);
	}

	createGroupFromTab(tabId: string, name: string = 'New Group') {
		const tab = this.tabs.find((t) => t.id === tabId);
		if (!tab) return null;
		const oldGroup = tab.groupId;
		if (oldGroup) {
			// pull it out of its current group first so that run stays contiguous
			const without = this.tabs.filter((t) => t.id !== tabId);
			const lastMember = without.map((t) => t.groupId).lastIndexOf(oldGroup);
			if (lastMember < 0) without.push(tab);
			else without.splice(lastMember + 1, 0, tab);
			this.tabs = without;
		}
		const id = crypto.randomUUID();
		const color = GROUP_COLORS[this.groups.length % GROUP_COLORS.length];
		this.groups.push({ id, name, color, collapsed: false });
		tab.groupId = id;
		if (oldGroup) this.cleanupGroup(oldGroup);
		return id;
	}

	renameGroup(id: string, name: string) {
		const g = this.getGroup(id);
		if (g) g.name = name;
	}

	setGroupColor(id: string, color: string) {
		const g = this.getGroup(id);
		if (g) g.color = color;
	}

	cycleGroupColor(id: string) {
		const g = this.getGroup(id);
		if (!g) return;
		const i = GROUP_COLORS.indexOf(g.color);
		g.color = GROUP_COLORS[(i + 1) % GROUP_COLORS.length];
	}

	toggleGroupCollapsed(id: string) {
		const g = this.getGroup(id);
		if (g) g.collapsed = !g.collapsed;
	}

	dissolveGroup(id: string) {
		this.tabs.forEach((t) => {
			if (t.groupId === id) t.groupId = undefined;
		});
		this.groups = this.groups.filter((g) => g.id !== id);
	}

	private cleanupGroup(id: string) {
		if (!this.tabs.some((t) => t.groupId === id)) {
			this.groups = this.groups.filter((g) => g.id !== id);
		}
	}

	removeFromGroup(tabId: string) {
		const tab = this.tabs.find((t) => t.id === tabId);
		if (!tab?.groupId) return;
		const gid = tab.groupId;
		const without = this.tabs.filter((t) => t.id !== tabId);
		// relocate just past the group's last remaining member so the run stays contiguous
		const lastMember = without.map((t) => t.groupId).lastIndexOf(gid);
		tab.groupId = undefined;
		if (lastMember < 0) without.push(tab);
		else without.splice(lastMember + 1, 0, tab);
		this.tabs = without;
		this.cleanupGroup(gid);
	}

	// Commit a drag: the dragged tab is reinserted relative to `anchor` (the row
	// directly above the drop point) and inherits that anchor's group.
	applyDrop(draggedId: string, anchor: DropAnchor) {
		const dragged = this.tabs.find((t) => t.id === draggedId);
		if (!dragged) return;
		const oldGroup = dragged.groupId;
		const without = this.tabs.filter((t) => t.id !== draggedId);

		let pos: number;
		let groupId: string | undefined;
		if (anchor.kind === 'top') {
			pos = 0;
			groupId = undefined;
		} else if (anchor.kind === 'tab') {
			const ai = without.findIndex((t) => t.id === anchor.id);
			if (ai < 0) {
				pos = without.length;
				groupId = undefined;
			} else {
				pos = ai + 1;
				groupId = without[ai].groupId;
			}
		} else {
			groupId = anchor.groupId;
			const first = without.findIndex((t) => t.groupId === anchor.groupId);
			pos = first < 0 ? without.length : first;
		}

		dragged.groupId = groupId;
		without.splice(pos, 0, dragged);
		this.tabs = without;

		if (oldGroup && oldGroup !== groupId) this.cleanupGroup(oldGroup);
		if (groupId) {
			const g = this.getGroup(groupId);
			if (g?.collapsed) g.collapsed = false;
		}
	}

	cycleTab(direction: 'next' | 'prev') {
		if (this.tabs.length < 2) return;
		const currentIndex = this.tabs.findIndex(t => t.id === this.activeTabId);
		if (currentIndex === -1) return;

		let nextIndex: number;
		if (direction === 'next') {
			nextIndex = (currentIndex + 1) % this.tabs.length;
		} else {
			nextIndex = (currentIndex - 1 + this.tabs.length) % this.tabs.length;
		}
		this.activeTabId = this.tabs[nextIndex].id;
	}

	updateTabPath(id: string, path: string) {
		const tab = this.tabs.find((t) => t.id === id);
		if (tab) {
			tab.path = path;
			tab.title = path.split(/[/\\]/).pop() || 'Untitled';
			tab.isDirty = false;
			if (tab.history.length > 0) {
				tab.history[tab.historyIndex] = path;
			} else {
				tab.history = [path];
				tab.historyIndex = 0;
			}
		}
	}

	renameTab(id: string, newPath: string) {
		const tab = this.tabs.find((t) => t.id === id);
		if (tab) {
			tab.path = newPath;
			tab.title = newPath.split(/[/\\]/).pop() || 'Untitled';
			if (tab.history.length > 0) {
				tab.history[tab.historyIndex] = newPath;
			}
		}
	}

	navigate(id: string, path: string) {
		const tab = this.tabs.find(t => t.id === id);
		if (tab) {
			if (tab.path === path) return;

			tab.history = tab.history.slice(0, tab.historyIndex + 1);
			tab.history.push(path);
			tab.historyIndex++;

			tab.path = path;
			tab.title = path.split(/[/\\]/).pop() || 'Untitled';
			tab.isDirty = false;
			tab.scrollTop = 0;
		}
	}

	canGoBack(id: string): boolean {
		const tab = this.tabs.find(t => t.id === id);
		return tab ? tab.historyIndex > 0 : false;
	}

	canGoForward(id: string): boolean {
		const tab = this.tabs.find(t => t.id === id);
		return tab ? tab.historyIndex < tab.history.length - 1 : false;
	}

	goBack(id: string): string | null {
		const tab = this.tabs.find(t => t.id === id);
		if (tab && tab.historyIndex > 0) {
			tab.historyIndex--;
			const path = tab.history[tab.historyIndex];
			tab.path = path;
			tab.title = path.split(/[/\\]/).pop() || 'Untitled';
			tab.isDirty = false;
			return path;
		}
		return null;
	}

	goForward(id: string): string | null {
		const tab = this.tabs.find(t => t.id === id);
		if (tab && tab.historyIndex < tab.history.length - 1) {
			tab.historyIndex++;
			const path = tab.history[tab.historyIndex];
			tab.path = path;
			tab.title = path.split(/[/\\]/).pop() || 'Untitled';
			tab.isDirty = false;
			return path;
		}
		return null;
	}

	recentlyClosed = $state<string[]>([]);

	popRecentlyClosed() {
		return this.recentlyClosed.pop();
	}
}

export const tabManager = new TabManager();

class NavHistory {
	stack = $state<string[]>([]);
	index = $state(-1);
	suppress = false;

	get canBack(): boolean {
		return this.index > 0;
	}

	get canForward(): boolean {
		return this.index >= 0 && this.index < this.stack.length - 1;
	}

	get backPath(): string | null {
		return this.canBack ? this.stack[this.index - 1] : null;
	}

	get forwardPath(): string | null {
		return this.canForward ? this.stack[this.index + 1] : null;
	}

	record(path: string) {
		if (this.suppress) return;
		if (!path || path === 'HOME') return;
		if (this.stack[this.index] === path) return;

		this.stack = [...this.stack.slice(0, this.index + 1), path];
		if (this.stack.length > 100) this.stack = this.stack.slice(this.stack.length - 100);
		this.index = this.stack.length - 1;
	}

	back(): string | null {
		if (!this.canBack) return null;
		this.index--;
		return this.stack[this.index];
	}

	forward(): string | null {
		if (!this.canForward) return null;
		this.index++;
		return this.stack[this.index];
	}
}

export const navHistory = new NavHistory();
