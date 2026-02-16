<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import * as monaco from 'monaco-editor';

	let {
		originalContent,
		modifiedContent,
		onaccept,
		ondismiss,
		theme = 'system',
	} = $props<{
		originalContent: string;
		modifiedContent: string;
		onaccept: () => void;
		ondismiss: () => void;
		theme?: 'system' | 'light' | 'dark';
	}>();

	let container = $state<HTMLDivElement>();
	let diffEditor: monaco.editor.IStandaloneDiffEditor;
	let wordWrap = $state(true);

	const toggleWordWrap = () => {
		wordWrap = !wordWrap;
		diffEditor?.updateOptions({ wordWrap: wordWrap ? 'on' : 'off' });
	};

	const isDark = () =>
		theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

	const getTheme = () => (isDark() ? 'dracula' : 'app-theme-light');

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			ondismiss();
		}
	}

	onMount(() => {
		if (!container) return;

		monaco.editor.defineTheme('app-theme-light', {
			base: 'vs',
			inherit: true,
			rules: [],
			colors: { 'editor.background': '#FDFDFD' },
		});

		monaco.editor.defineTheme('dracula', {
			base: 'vs-dark',
			inherit: true,
			rules: [
				{ background: '282a36', token: '' },
				{ foreground: '6272a4', token: 'comment' },
				{ foreground: 'f1fa8c', token: 'string' },
				{ foreground: 'bd93f9', token: 'constant.numeric' },
				{ foreground: 'bd93f9', token: 'constant.language' },
				{ foreground: 'bd93f9', token: 'constant.character' },
				{ foreground: 'bd93f9', token: 'constant.other' },
				{ foreground: 'ffb86c', token: 'variable.other.readwrite.instance' },
				{ foreground: 'ff79c6', token: 'constant.character.escaped' },
				{ foreground: 'ff79c6', token: 'constant.character.escape' },
				{ foreground: 'ff79c6', token: 'string source' },
				{ foreground: 'ff79c6', token: 'keyword' },
				{ foreground: 'ff79c6', token: 'storage' },
				{ foreground: '8be9fd', fontStyle: 'italic', token: 'storage.type' },
				{ foreground: '50fa7b', fontStyle: 'underline', token: 'entity.name.class' },
				{ foreground: '50fa7b', fontStyle: 'italic underline', token: 'entity.other.inherited-class' },
				{ foreground: '50fa7b', token: 'entity.name.function' },
				{ foreground: 'ffb86c', fontStyle: 'italic', token: 'variable.parameter' },
				{ foreground: 'ff79c6', token: 'entity.name.tag' },
				{ foreground: '50fa7b', token: 'entity.other.attribute-name' },
				{ foreground: '8be9fd', token: 'support.function' },
				{ foreground: '6be5fd', token: 'support.constant' },
				{ foreground: '66d9ef', fontStyle: 'italic', token: 'support.type' },
				{ foreground: '66d9ef', fontStyle: 'italic', token: 'support.class' },
				{ foreground: 'ff79c6', token: 'markup.deleted' },
				{ foreground: '50fa7b', token: 'markup.inserted' },
				{ foreground: 'e6db74', token: 'markup.changed' },
				{ foreground: 'f83333', token: 'message.error' },
			],
			colors: {
				'editor.foreground': '#f8f8f2',
				'editor.background': '#282a36',
				'editor.selectionBackground': '#44475a',
				'editor.lineHighlightBackground': '#44475a',
				'editorCursor.foreground': '#f8f8f0',
				'editorWhitespace.foreground': '#3B3A32',
				'editorIndentGuide.activeBackground': '#9D550FB0',
				'editor.selectionHighlightBorder': '#222218',
			},
		});

		diffEditor = monaco.editor.createDiffEditor(container, {
			theme: getTheme(),
			automaticLayout: true,
			readOnly: true,
			renderSideBySide: true,
			scrollBeyondLastLine: false,
			minimap: { enabled: false },
			wordWrap: 'on',
			originalEditable: false,
		});

		diffEditor.setModel({
			original: monaco.editor.createModel(originalContent, 'markdown'),
			modified: monaco.editor.createModel(modifiedContent, 'markdown'),
		});

		return () => {
			const model = diffEditor.getModel();
			model?.original.dispose();
			model?.modified.dispose();
			diffEditor.dispose();
		};
	});

	$effect(() => {
		if (diffEditor && theme) {
			monaco.editor.setTheme(getTheme());
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="diff-backdrop" transition:fade={{ duration: 150 }} onclick={ondismiss}>
	<div class="diff-panel" transition:scale={{ duration: 200, start: 0.97 }} onclick={(e) => e.stopPropagation()}>
		<div class="diff-header">
			<h3>File Changed</h3>
			<div class="diff-actions">
				<button class="diff-btn icon {wordWrap ? 'active' : ''}" onclick={toggleWordWrap} aria-label="Toggle Word Wrap" title="Word Wrap">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
						><path d="M3 6h18"></path><path d="M3 12h15a3 3 0 1 1 0 6h-4"></path><polyline points="13 16 11 18 13 20"></polyline><path d="M3 18h4"></path></svg>
				</button>
				<button class="diff-btn secondary" onclick={ondismiss}>Dismiss</button>
				<button class="diff-btn primary" onclick={onaccept}>Accept</button>
			</div>
		</div>
		<div class="diff-editor" bind:this={container}></div>
	</div>
</div>

<style>
	.diff-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 30000;
	}

	.diff-panel {
		display: flex;
		flex-direction: column;
		width: 90vw;
		height: 85vh;
		background: var(--color-canvas-default);
		border: 1px solid var(--color-border-default);
		border-radius: 8px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
		overflow: hidden;
	}

	.diff-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 20px;
		border-bottom: 1px solid var(--color-border-default);
		background: var(--color-canvas-subtle);
	}

	.diff-header h3 {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
		color: var(--color-fg-default);
		font-family: var(--win-font);
	}

	.diff-actions {
		display: flex;
		gap: 8px;
	}

	.diff-btn {
		padding: 5px 14px;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		border: 1px solid transparent;
		font-family: var(--win-font);
		transition: all 0.1s;
	}

	.diff-btn.icon {
		padding: 5px;
		background: transparent;
		color: var(--color-fg-muted);
		border-color: var(--color-border-default);
		display: flex;
		align-items: center;
		margin-right: 4px;
	}

	.diff-btn.icon.active {
		color: var(--color-accent-fg);
		background: var(--color-canvas-default);
	}

	.diff-btn.icon:hover {
		background: var(--color-neutral-muted);
		color: var(--color-fg-default);
	}

	.diff-btn.secondary {
		background: transparent;
		color: var(--color-fg-default);
		border-color: var(--color-border-default);
	}

	.diff-btn.secondary:hover {
		background: var(--color-neutral-muted);
	}

	.diff-btn.primary {
		background: #0078d4;
		color: white;
	}

	.diff-btn.primary:hover {
		filter: brightness(1.1);
	}

	.diff-editor {
		flex: 1;
		overflow: hidden;
	}
</style>
