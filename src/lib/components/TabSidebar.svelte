<script lang="ts">
	import { type Tab as TabData, tabManager } from '../stores/tabs.svelte.js';
	import Tab from './Tab.svelte';
	import ContextMenu, { type ContextMenuItem } from './ContextMenu.svelte';
	import { t } from '../utils/i18n.js';
	import { settings } from '../stores/settings.svelte.js';
	import { emit } from '@tauri-apps/api/event';

	import { flip } from 'svelte/animate';
	import { tick } from 'svelte';

	let { showHome = false, ontabclick, oncloseTab } = $props<{
		showHome?: boolean;
		ontabclick?: () => void;
		oncloseTab?: (id: string) => void;
	}>();

	let scrollContainer = $state<HTMLElement | null>(null);

	let draggingId = $state<string | null>(null);
	let justDragged = false;
	let dragState = $state<{
		startY: number;
		currentY: number;
		initialRect: DOMRect;
		tab: TabData;
		isDragging: boolean;
	} | null>(null);

	let contextMenu = $state<{
		show: boolean;
		x: number;
		y: number;
		items: ContextMenuItem[];
	}>({ show: false, x: 0, y: 0, items: [] });

	function handleMouseDown(e: MouseEvent, tab: TabData, element: HTMLElement) {
		if (e.button !== 0) return;
		e.stopPropagation();
		e.preventDefault();

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

		const children = Array.from(scrollContainer.children) as HTMLElement[];
		let closestIndex = -1;
		let minDist = Infinity;

		children.forEach((child, index) => {
			if (!child.classList.contains('tab-item-wrapper')) return;

			const rect = child.getBoundingClientRect();
			const center = rect.top + rect.height / 2;
			const dist = Math.abs(e.clientY - center);

			if (dist < minDist) {
				minDist = dist;
				closestIndex = index;
			}
		});

		if (closestIndex !== -1) {
			const currentIndex = tabManager.tabs.findIndex((t) => t.id === draggingId);
			if (currentIndex !== -1 && currentIndex !== closestIndex) {
				tabManager.reorderTabs(currentIndex, closestIndex);
			}
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

	$effect(() => {
		const activeId = tabManager.activeTabId;
		if (activeId && scrollContainer && !draggingId) {
			const index = tabManager.tabs.findIndex((t) => t.id === activeId);
			if (index !== -1) {
				tick().then(() => {
					if (!scrollContainer) return;
					const el = scrollContainer.children[index] as HTMLElement | undefined;
					if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
				});
			}
		}
	});

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
			class="new-tab-btn"
			onclick={() => tabManager.addNewTab()}
			onmousedown={(e) => e.preventDefault()}
			title={`${t('tooltip.newTab', settings.language)} (Ctrl+T)`}>
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
		{#each tabManager.tabs as tab (tab.id)}
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<div
				class="tab-item-wrapper"
				animate:flip={{ duration: 200 }}
				role="listitem"
				class:drag-opacity={draggingId === tab.id}
				onmousedown={(e) => handleMouseDown(e, tab, e.currentTarget as HTMLElement)}>
				<Tab
					{tab}
					vertical
					isActive={!showHome && tabManager.activeTabId === tab.id}
					onclick={() => {
						if (justDragged) return;
						tabManager.setActive(tab.id);
						ontabclick?.();
					}}
					onclose={() => oncloseTab?.(tab.id)} />
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
		justify-content: flex-end;
		align-items: center;
		padding: 8px 8px 4px;
		flex-shrink: 0;
	}

	.new-tab-btn {
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
		transition:
			background 0.1s,
			color 0.1s;
	}

	.new-tab-btn:hover {
		background: var(--color-neutral-muted);
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

	.tab-item-wrapper.drag-opacity {
		opacity: 0;
		pointer-events: none;
	}

	.drag-proxy {
		position: fixed;
		z-index: 10000;
		pointer-events: none;
		opacity: 0.9;
		will-change: top;
	}
</style>
