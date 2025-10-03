/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActiveLineMarker } from './activeLineMarker';
import { onceDocumentLoaded } from './events';
import { createPosterForVsCode } from './messaging';
import { getEditorLineNumberForPageOffset, scrollToRevealSourceLine } from './scroll-sync';
import { getSettings, getData } from './settings';
import throttle = require('lodash.throttle');

declare var acquireVsCodeApi: any;

var scrollDisabled = true;
const marker = new ActiveLineMarker();
const settings = getSettings();

const vscode = acquireVsCodeApi();

// Set VS Code state
const state = getData('data-state');
vscode.setState(state);

const messaging = createPosterForVsCode(vscode);

window.cspAlerter.setPoster(messaging);

onceDocumentLoaded(() => {
	if (settings.scrollPreviewWithEditor) {
		setTimeout(() => {
			const initialLine = +settings.line;
			if (!isNaN(initialLine)) {
				scrollDisabled = true;
				scrollToRevealSourceLine(initialLine);
			}
		}, 0);
	}
});

const onUpdateView = (() => {
	const doScroll = throttle((line: number) => {
		scrollDisabled = true;
		scrollToRevealSourceLine(line);
	}, 50);

	return (line: number, settings: any) => {
		if (!isNaN(line)) {
			settings.line = line;
			doScroll(line);
		}
	};
})();

window.addEventListener('resize', () => {
	scrollDisabled = true;
}, true);

window.addEventListener('message', event => {
    if (event.data.source !== settings.source) {
        return;
    }

    switch (event.data.type) {
        case 'onDidChangeTextEditorSelection':
            marker.onDidChangeTextEditorSelection(event.data.line);
            // Also ensure the active selection is visible in the preview
            onUpdateView(event.data.line, settings);
            break;

		case 'updateView':
			onUpdateView(event.data.line, settings);
			break;
	}
}, false);

document.addEventListener('dblclick', event => {
	if (!settings.doubleClickToSwitchToEditor) {
		return;
	}

	// Ignore clicks on links
	for (let node = event.target as HTMLElement; node; node = node.parentNode as HTMLElement) {
		if (node.tagName === 'A') {
			return;
		}
	}

	const offset = event.pageY;
	const line = getEditorLineNumberForPageOffset(offset);
	if (typeof line === 'number' && !isNaN(line)) {
		messaging.postMessage('didClick', { line: Math.floor(line) });
	}
});

document.addEventListener('click', event => {
	if (!event) {
		return;
	}

	let node: any = event.target;
	while (node) {
		if (node.tagName && node.tagName === 'A' && node.href) {
			if (node.getAttribute('href').startsWith('#')) {
				break;
			}
			if (node.href.startsWith('file://') || node.href.startsWith('vscode-resource:')) {
				const [path, fragment] = node.href.replace(/^(file:\/\/|vscode-resource:)/i, '').split('#');
				messaging.postCommand('_html.openDocumentLink', [{ path, fragment }]);
				event.preventDefault();
				event.stopPropagation();
				break;
			}
			break;
		}
		node = node.parentNode;
	}
}, true);

// Element selection in preview -> focus corresponding source element
document.addEventListener('click', (event: MouseEvent) => {
    if (!event) {
        return;
    }

    const isAnchorAncestor = (n: HTMLElement | null): boolean => {
        for (let cur = n; cur; cur = cur.parentElement) {
            if (cur.tagName === 'A') {
                return true;
            }
        }
        return false;
    };

    const findCodeLineElement = (n: HTMLElement | null): HTMLElement | null => {
        for (let cur = n; cur; cur = cur.parentElement) {
            if (cur.hasAttribute('data-line') || cur.classList.contains('code-line')) {
                return cur;
            }
        }
        return null;
    };

    const target = event.target as HTMLElement | null;
    if (!target) {
        return;
    }

    // Let dedicated link handler handle links
    if (isAnchorAncestor(target)) {
        return;
    }

    const el = findCodeLineElement(target);
    if (!el) {
        return;
    }

    // Apply selection highlight
    const previous = document.querySelector('.code-selected-element') as HTMLElement | null;
    if (previous && previous !== el) {
        previous.classList.remove('code-selected-element');
    }
    el.classList.add('code-selected-element');
    // Ensure the selected element is visible in the preview
    try {
        // Prevent the scroll listener from echoing back to the editor
        scrollDisabled = true;
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    } catch {}

    // Gather info for focus
    const lineAttr = el.getAttribute('data-line');
    const line = lineAttr ? parseInt(lineAttr, 10) : undefined;
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    const id = el.getAttribute('id') || undefined;
    const classes = (el.getAttribute('class') || '')
        .split(/\s+/)
        .filter(c => c && c !== 'code-line' && c !== 'code-selected-element');
    const className = classes.length ? classes[0] : undefined;

    messaging.postCommand('_html.focusElement', [line, tag, className, id]);
}, false);

if (settings.scrollEditorWithPreview) {
	window.addEventListener('scroll', throttle(() => {
		if (scrollDisabled) {
			scrollDisabled = false;
		} else {
			const line = getEditorLineNumberForPageOffset(window.scrollY);
			if (typeof line === 'number' && !isNaN(line)) {
				messaging.postMessage('revealLine', { line });
			}
		}
	}, 50));
}
