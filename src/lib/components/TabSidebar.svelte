<script lang="ts">
	import { type Tab as TabData, type TabGroup, type DropAnchor, tabManager } from '../stores/tabs.svelte.js';
	import Tab from './Tab.svelte';
	import ContextMenu, { type ContextMenuItem } from './ContextMenu.svelte';
	import { t } from '../utils/i18n.js';
	import { settings } from '../stores/settings.svelte.js';
	import { emit } from '@tauri-apps/api/event';

	import { flip } from 'svelte/animate';

	let { showHome = false, ontabclick, oncloseTab } = $props<{
		showHome?: boolean;
		ontabclick?: () => void;
		oncloseTab?: (id: string) => void;
	}>();

	let scrollContainer = $state<HTMLElement | null>(null);

	let draggingId = $state<string | null>(null);
	let justDragged = false;
	let lastAnchorKey = '';
	let dragState = $state<{
		startY: number;
		currentY: number;
		initialRect: DOMRect;
		tab: TabData;
		isDragging: boolean;
	} | null>(null);

	let editingGroupId = $state<string | null>(null);
	let editingName = $state('');

	let contextMenu = $state<{ show: boolean; x: number; y: number; items: ContextMenuItem[] }>({
		show: false,
		x: 0,
		y: 0,
		items: [],
	});

	type SidebarRow = { kind: 'header'; group: TabGroup; count: number } | { kind: 'tab'; tab: TabData };

	// Walk the flat tab list into headers + (indented) member rows. Runs are
	// contiguous by construction, so each group surfaces exactly one header.
	let rows = $derived.by(() => {
		const out: SidebarRow[] = [];
		const tabs = tabManager.tabs;
		let i = 0;
		while (i < tabs.length) {
			const tab = tabs[i];
			const group = tab.groupId ? tabManager.getGroup(tab.groupId) : undefined;
			if (tab.groupId && group) {
				let j = i;
				while (j < tabs.length && tabs[j].groupId === tab.groupId) j++;
				out.push({ kind: 'header', group, count: j - i });
				if (!group.collapsed) {
					for (let k = i; k < j; k++) out.push({ kind: 'tab', tab: tabs[k] });
				}
				i = j;
			} else {
				out.push({ kind: 'tab', tab });
				i++;
			}
		}
		return out;
	});

	const rowKey = (row: SidebarRow) => (row.kind === 'header' ? `h:${row.group.id}` : `t:${row.tab.id}`);

	function buildTabMenu(tab: TabData): ContextMenuItem[] {
		const items: ContextMenuItem[] = [
			{
				label: 'New group',
				onClick: () => {
					const id = tabManager.createGroupFromTab(tab.id);
					if (id) startRename(id, 'New Group');
				},
			},
		];
		if (tab.groupId) {
			items.push({ label: 'Remove from group', onClick: () => tabManager.removeFromGroup(tab.id) });
		}
		return items;
	}

	function autofocus(node: HTMLInputElement) {
		node.focus();
		node.select();
	}

	function startRename(groupId: string, current: string) {
		editingGroupId = groupId;
		editingName = current;
	}

	function commitRename() {
		if (editingGroupId) {
			const name = editingName.trim();
			if (name) tabManager.renameGroup(editingGroupId, name);
		}
		editingGroupId = null;
	}

	function handleHeaderContextMenu(e: MouseEvent, group: TabGroup) {
		e.preventDefault();
		e.stopPropagation();
		contextMenu = {
			show: true,
			x: e.clientX,
			y: e.clientY,
			items: [
				{ label: t('menu.rename', settings.language), onClick: () => startRename(group.id, group.name) },
				{ label: 'Ungroup', onClick: () => tabManager.dissolveGroup(group.id) },
			],
		};
	}

	function handleMouseDown(e: MouseEvent, tab: TabData, element: HTMLElement) {
		if (e.button !== 0) return;
		e.stopPropagation();
		e.preventDefault();

		lastAnchorKey = '';
		dragState = {
			startY: e.clientY,
			currentY: e.clientY,
			initialRect: element.getBoundingClientRect(),
			tab: tab,
			isDragging: false,
		};

		window.addEventListener('mousemove', handleWindowMouseMove);
		window.addEventListener('mouseup', handleWindowMouseUp);
	}

	function handleWindowMouseMove(e: MouseEvent) {
		if (!dragState || !scrollContainer) return;

		if (!dragState.isDragging) {
			if (Math.abs(e.clientY - dragState.startY) > 5) {
				dragState.isDragging = true;
				draggingId = dragState.tab.id;
			} else {
				return;
			}
		}

		dragState.currentY = e.clientY;

		const containerRect = scrollContainer.getBoundingClientRect();
		const scrollZone = 40;
		if (e.clientY < containerRect.top + scrollZone) {
			scrollContainer.scrollTop -= 8;
		} else if (e.clientY > containerRect.bottom - scrollZone) {
			scrollContainer.scrollTop += 8;
		}

		// Anchor = last row whose midpoint sits above the pointer (dragged row excluded).
		const rowEls = (Array.from(scrollContainer.querySelectorAll('.sidebar-row')) as HTMLElement[]).filter(
			(el) => el.dataset.tabId !== draggingId
		);
		let anchorEl: HTMLElement | null = null;
		for (const el of rowEls) {
			const r = el.getBoundingClientRect();
			if (e.clientY >= r.top + r.height / 2) anchorEl = el;
			else break;
		}

		let anchor: DropAnchor;
		if (!anchorEl) anchor = { kind: 'top' };
		else if (anchorEl.dataset.rowKind === 'header') anchor = { kind: 'header', groupId: anchorEl.dataset.groupId! };
		else anchor = { kind: 'tab', id: anchorEl.dataset.tabId! };

		const key = anchor.kind === 'top' ? 'top' : anchor.kind === 'header' ? `h:${anchor.groupId}` : `t:${anchor.id}`;
		if (key !== lastAnchorKey) {
			lastAnchorKey = key;
			if (draggingId) tabManager.applyDrop(draggingId, anchor);
		}
	}

	function handleWindowMouseUp() {
		if (dragState?.isDragging) {
			justDragged = true;
			setTimeout(() => {
				justDragged = false;
			}, 50);
		}

		draggingId = null;
		dragState = null;
		window.removeEventListener('mousemove', handleWindowMouseMove);
		window.removeEventListener('mouseup', handleWindowMouseUp);
	}

	function handleEmptyContextMenu(e: MouseEvent) {
		if (e.target !== e.currentTarget) return;
		e.preventDefault();

		const currentLang = settings.language;
		contextMenu = {
			show: true,
			x: e.clientX,
			y: e.clientY,
			items: [
				{ label: t('menu.newFile', currentLang), shortcut: 'Ctrl+T', onClick: () => emit('menu-tab-new') },
				{ label: t('menu.undoCloseTab', currentLang), shortcut: 'Ctrl+Shift+T', onClick: () => emit('menu-tab-undo') },
			],
		};
	}
</script>

<div class="tab-sidebar">
	<div class="tab-sidebar-header">
		<button
			class="hdr-btn {settings.pinnedTabsSidebar ? 'active' : ''}"
			onclick={() => settings.togglePinnedTabsSidebar()}
			onmousedown={(e) => e.preventDefault()}
			title={settings.pinnedTabsSidebar ? t('tooltip.undock', settings.language) : t('tooltip.dock', settings.language)}
			aria-label={settings.pinnedTabsSidebar ? t('tooltip.undock', settings.language) : t('tooltip.dock', settings.language)}>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
				<rect width="18" height="18" x="3" y="3" rx="2" />
				<path d="M9 3v18" />
				{#if !settings.pinnedTabsSidebar}
					<path d="m14 9-3 3 3 3" />
				{/if}
			</svg>
		</button>
		<button
			class="hdr-btn"
			onclick={() => tabManager.addNewTab()}
			onmousedown={(e) => e.preventDefault()}
			title={`${t('tooltip.newTab', settings.language)} (Ctrl+T)`}
			aria-label={t('tooltip.newTab', settings.language)}>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
				><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
		</button>
	</div>

	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		bind:this={scrollContainer}
		class="tab-sidebar-list"
		role="tablist"
		tabindex="-1"
		oncontextmenu={handleEmptyContextMenu}>
		{#each rows as row (rowKey(row))}
			<div class="row-anim" animate:flip={{ duration: 200 }}>
			{#if row.kind === 'header'}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="sidebar-row group-header"
					data-row-kind="header"
					data-group-id={row.group.id}
					oncontextmenu={(e) => handleHeaderContextMenu(e, row.group)}>
					<button
						class="grp-chevron {row.group.collapsed ? 'collapsed' : ''}"
						onclick={() => tabManager.toggleGroupCollapsed(row.group.id)}
						aria-label="Toggle group">
						<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
					</button>
					<button
						class="grp-color"
						style:background={row.group.color}
						onclick={() => tabManager.cycleGroupColor(row.group.id)}
						aria-label="Change color"
						title="Change color"></button>
					{#if editingGroupId === row.group.id}
						<input
							class="grp-name-input"
							bind:value={editingName}
							use:autofocus
							onblur={commitRename}
							onkeydown={(e) => {
								if (e.key === 'Enter') commitRename();
								else if (e.key === 'Escape') editingGroupId = null;
							}} />
					{:else}
						<button class="grp-name" ondblclick={() => startRename(row.group.id, row.group.name)} title={row.group.name}>
							{row.group.name}
						</button>
					{/if}
					<span class="grp-count">{row.count}</span>
				</div>
			{:else}
				{@const group = row.tab.groupId ? tabManager.getGroup(row.tab.groupId) : undefined}
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<div
					class="sidebar-row tab-item-wrapper"
					class:grouped={!!group}
					data-row-kind="tab"
					data-tab-id={row.tab.id}
					style:--grp-color={group?.color ?? 'transparent'}
					role="listitem"
					class:drag-opacity={draggingId === row.tab.id}
					onmousedown={(e) => handleMouseDown(e, row.tab, e.currentTarget as HTMLElement)}>
					<Tab
						tab={row.tab}
						vertical
						extraMenuItems={buildTabMenu(row.tab)}
						isActive={!showHome && tabManager.activeTabId === row.tab.id}
						onclick={() => {
							if (justDragged) return;
							tabManager.setActive(row.tab.id);
							ontabclick?.();
						}}
						onclose={() => oncloseTab?.(row.tab.id)} />
				</div>
			{/if}
			</div>
		{/each}
	</div>

	{#if draggingId && dragState}
		<div
			class="drag-proxy"
			style:left="{dragState.initialRect.left}px"
			style:top="{dragState.initialRect.top + (dragState.currentY - dragState.startY)}px"
			style:width="{dragState.initialRect.width}px">
			<Tab tab={dragState.tab} vertical isActive={!showHome && tabManager.activeTabId === dragState.tab.id} onclick={() => {}} onclose={() => {}} />
		</div>
	{/if}
</div>

<ContextMenu {...contextMenu} onhide={() => (contextMenu.show = false)} />

<style>
	.tab-sidebar {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		overflow: hidden;
		font-family: var(--win-font);
	}

	.tab-sidebar-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 8px 4px;
		flex-shrink: 0;
	}

	.hdr-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		background: transparent;
		color: var(--color-fg-muted);
		border-radius: 8px;
		cursor: pointer;
		flex-shrink: 0;
		opacity: 0.7;
		transition:
			background 0.1s,
			color 0.1s,
			opacity 0.1s;
	}

	.hdr-btn:hover {
		background: var(--color-neutral-muted);
		color: var(--color-fg-default);
		opacity: 1;
	}

	.hdr-btn.active {
		opacity: 1;
		background: var(--color-canvas-subtle);
		color: var(--color-fg-default);
	}

	.tab-sidebar-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
		padding: 4px 8px 16px;
		scroll-behavior: smooth;
		scrollbar-width: thin;
	}

	.tab-item-wrapper {
		transition: opacity 0.1s;
	}

	.tab-item-wrapper.grouped {
		margin-left: 8px;
		border-left: 2px solid var(--grp-color);
		border-top-left-radius: 0;
		border-bottom-left-radius: 0;
	}

	.tab-item-wrapper.drag-opacity {
		opacity: 0;
		pointer-events: none;
	}

	.group-header {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 2px 4px 2px 2px;
		height: 26px;
		user-select: none;
	}

	.grp-chevron {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		padding: 0;
		border: none;
		background: transparent;
		color: var(--color-fg-muted);
		cursor: pointer;
		border-radius: 4px;
		flex-shrink: 0;
		transition: transform 0.2s ease;
	}

	.grp-chevron.collapsed {
		transform: rotate(-90deg);
	}

	.grp-chevron:hover {
		color: var(--color-fg-default);
	}

	.grp-color {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		border: none;
		cursor: pointer;
		flex-shrink: 0;
		padding: 0;
	}

	.grp-name {
		flex: 1;
		min-width: 0;
		text-align: left;
		background: transparent;
		border: none;
		color: var(--color-fg-default);
		font-size: 12px;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		padding: 2px 4px;
		border-radius: 4px;
	}

	.grp-name:hover {
		background: var(--color-neutral-muted);
	}

	.grp-name-input {
		flex: 1;
		min-width: 0;
		background: var(--color-canvas-default);
		border: 1px solid var(--color-accent-fg);
		color: var(--color-fg-default);
		font-size: 12px;
		font-weight: 600;
		font-family: inherit;
		padding: 1px 4px;
		border-radius: 4px;
		outline: none;
	}

	.grp-count {
		font-size: 11px;
		color: var(--color-fg-muted);
		padding-right: 4px;
		flex-shrink: 0;
	}

	.drag-proxy {
		position: fixed;
		z-index: 10000;
		pointer-events: none;
		opacity: 0.9;
		will-change: top;
	}
</style>
