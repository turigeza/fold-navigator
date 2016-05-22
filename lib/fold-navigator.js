'use babel';

import FoldNavigatorView from './fold-navigator-view';
import {
    CompositeDisposable
} from 'atom';

export default {
    config: {
        autofold: {
            title: 'Autofold on open',
            description: 'Autofold all folds when you open a document.',
            type: 'boolean',
            default: false
        },
        keepFolding: {
            title: 'Keep code folded.',
            description: 'Everytime you click on one of the fold navigator element all code folds will be folded before the selected fold opens. Usefull if you want to keep your code folded all the time. Note that if you are using ctrl-alt-cmd-up/down keys to navigate it will not close the folds. Also you can temporarily enable/disable this behaviour by holding down the option key while you click.',
            type: 'boolean',
            default: false
        },
        showLineNumbers: {
            title: 'Show line number.',
            description: 'Show line numbers in fold navigator.',
            type: 'boolean',
            default: true
        },
        indentationCharacter: {
            title: 'Indentation character.',
            description: 'The character used for indentation in the fold navigator panel.',
            type: 'string',
            default: 'x'
        },
        maxLineContentLength: {
            title: 'Maximum line length.',
            description: 'Fold Navigator will take the line on which the fold is on but if the line is longer than this many characters then it will truncate it.',
            type: 'integer',
            default: 60
        },
        minLineLength: {
            title: 'Minimum line length.',
            description: 'Sometimes the fold falls on line which contains very little information. Typically comments like /** are meaningless. If the line content is less then this many characters use the next line for the fold description.',
            type: 'integer',
            default: 6
        },
        keepFoldingAllTime: {
            title: 'Keep code folded even on shortcuts.',
            description: 'It will fold all folds before opening a new one.',
            type: 'boolean',
            default: false
        },
        autoScrollFoldNavigatorPanel: {
            title: 'Auto scroll fold navigator panel.',
            description: 'Scrolls the fold navigator panel to the active fold.',
            type: 'boolean',
            default: false
        },
        unfoldAllSubfolds: {
            title: 'Unfold all subfolds.',
            description: 'When a fold is selected/active all subfolds will be unfolded as well. When you have lots of subfolds to open this can be sluggish. ',
            type: 'boolean',
            default: true
        },
    },

    foldNavigatorView: null,
    panel: null,
    subscriptions: null,
    lines2fold: [],
    activeFold: null,
    activeEditor: null, // the active editor
    searchModal: null,

    activate(state) {
        //console.log(arguments.callee.name);

        /*
        Key is the line number and the value is the line number of the last fold looped through in the document.
        currently the fold ending are not observed maybe I should change this in the future
        */
        this.lines2fold = [];
        this.panel = null; // foldnavigator panel
        this.subscriptions = new CompositeDisposable();
        this.editorSubscriptions = new CompositeDisposable();
        this.foldNavigatorView = null;

        // subscriptions
        this.onDidChangeCursorPositionSubscription = null;

        /* THIS.FUNCTIONS();
         */
        this.iniSettings();
        this.foldNavigatorView = new FoldNavigatorView(state.foldNavigatorViewState);

        // attach onclick event to the fold navigator lines
        this.navigatorElementOnClick();

        this.registerCommands();
        this.addNavigatorPanel();
        this.addSearchModal();

        // parse content of editor each time it stopped changing
        atom.workspace.observeTextEditors((editor) => {
            this.observeTextEditors(editor)
        });

        // when active pane item changed parse code and change content of navigator panel
        atom.workspace.observeActivePaneItem((pane) => {
            this.observeActivePaneItem(pane)
        });

    },

    addSearchModal() {

        this.searchModalElement = document.createElement('div');
        this.searchModalElement.innerHTML = '<textarea></textarea>';
        this.searchModalElement.classList.add('fold-navigator-search-box');

        this.searchModal = atom.workspace.addModalPanel({
            item: this.searchModalElement,
            visible: false
        });
    },

    hideSearch() {
        this.searchModal.hide();
    },

    showSearch() {
        this.searchModal.show();
    },

    toggleSearch() {
        if (this.searchModal.isVisible()) {
            this.searchModal.hide();
        } else {
            this.searchModal.show();
        }
    },

    onDoubleClickTextEditor(){

        console.log('dblclicked');
        console.log(this);

    },

    // observer text editors coming and going
    observeTextEditors(editor) {
        //console.log(arguments.callee.name);
        if (this.settings.autofold)
            editor.foldAll();

    },

    // every time the active pane changes this will get called
    observeActivePaneItem(pane) {
        //console.log(arguments.callee.name);

        var editor = atom.workspace.getActiveTextEditor();
        var listener;
        var editorView;

        if (!editor)
            return;

        var editorView = atom.views.getView(editor);

        if(!this.temp)
            this.temp = ()=>{ this.onDoubleClickTextEditor() };

        editorView.removeEventListener('dblclick', this.temp);
        editorView.addEventListener('dblclick', this.temp);

        this.parse(editor);

        //dispose of previous subscription
        if (this.onDidChangeCursorPositionSubscription) {
            this.onDidChangeCursorPositionSubscription.dispose();
        }

        // follow cursor in fold navigator register subscription so that we can remove it
        this.onDidChangeCursorPositionSubscription = editor.onDidChangeCursorPosition((event) => {
            this.onDidChangeCursorPosition(event);
        });

        //dispose of previous subscription
        if (this.onDidStopChangingSubscription) {
            this.onDidStopChangingSubscription.dispose();
        }

        // if document changed subscription
        this.onDidStopChangingSubscription = editor.onDidStopChanging(() => this.parse(editor));

    },

    onDidChangeCursorPosition(event) {
        //console.log(arguments.callee.name);
        this.selectRow(event.newBufferPosition.row);

    },

    addNavigatorPanel() {
        //console.log(arguments.callee.name);
        var element = this.foldNavigatorView.getElement();
        if (atom.config.get('tree-view.showOnRightSide')) {
            this.panel = atom.workspace.addLeftPanel({
                item: element,
                visible: false
            });
        } else {
            this.panel = atom.workspace.addRightPanel({
                item: element,
                visible: false
            });
        }
    },

    iniSettings() {
        //console.log(arguments.callee.name);
        var editor = atom.workspace.getActiveTextEditor();

        if (editor) {
            let scope = editor.getGrammar().scopeName;
            let languageSettings = atom.config.get('fold-navigator', {
                'scope': [scope]
            });

            this.settings = atom.config.get('fold-navigator');
            if (languageSettings)
                Object.assign(this.settings, languageSettings);
        }

        /*
        // watch for changes in settings so we don't have to reload atom window for it to take effect
        atom.config.observe('fold-navigator', (updatedSettings) => {
            this.settings = updatedSettings;
            return;
        });
        */
    },

    registerCommands() {
        //console.log(arguments.callee.name);
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'fold-navigator:toggle': () => this.toggle()
        }));
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'fold-navigator:open': () => this.open()
        }));
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'fold-navigator:close': () => this.close()
        }));
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'fold-navigator:previousFold': () => this.previousFold()
        }));
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'fold-navigator:nextFold': () => this.nextFold()
        }));
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'fold-navigator:moveLevelUp': () => this.moveLevelUp()
        }));
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'fold-navigator:moveLevelDown': () => this.moveLevelDown()
        }));
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'fold-navigator:nextFoldAtCurrentLevel': () => this.nextFoldAtCurrentLevel()
        }));
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'fold-navigator:previousFoldAtCurrentLevel': () => this.previousFoldAtCurrentLevel()
        }));
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'fold-navigator:unfoldSubfolds': () => this.unfoldSubfoldsPublic()
        }));
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'fold-navigator:unfoldAtLevel1': () => this.unfoldAtLevel1()
        }));
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'fold-navigator:unfoldAtLevel2': () => this.unfoldAtLevel2()
        }));
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'fold-navigator:unfoldAtLevel3': () => this.unfoldAtLevel3()
        }));
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'fold-navigator:unfoldAtLevel4': () => this.unfoldAtLevel4()
        }));
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'fold-navigator:unfoldAtLevel5': () => this.unfoldAtLevel5()
        }));
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'fold-navigator:foldAtLevel1': () => this.foldAtLevel1()
        }));
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'fold-navigator:foldAtLevel2': () => this.foldAtLevel2()
        }));
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'fold-navigator:foldAtLevel3': () => this.foldAtLevel3()
        }));
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'fold-navigator:foldAtLevel4': () => this.foldAtLevel4()
        }));
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'fold-navigator:foldAtLevel5': () => this.foldAtLevel5()
        }));
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'fold-navigator:toggleFoldsLevel1': () => this.toggleFoldsLevel1()
        }));
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'fold-navigator:toggleFoldsLevel2': () => this.toggleFoldsLevel2()
        }));
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'fold-navigator:toggleFoldsLevel3': () => this.toggleFoldsLevel3()
        }));
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'fold-navigator:toggleFoldsLevel4': () => this.toggleFoldsLevel4()
        }));
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'fold-navigator:toggleFoldsLevel5': () => this.toggleFoldsLevel5()
        }));
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'fold-navigator:toggleSearch': () => this.toggleSearch()
        }));
    },

    previousFold() {
        //console.log(arguments.callee.name);
        var fold = this.foldNavigatorView.getActiveFold();
        var index = this.folds.indexOf(fold);
        var previous;
        var editor = atom.workspace.getActiveTextEditor();
        if (!editor)
            return;

        if (index !== 0) {
            previous = this.folds[index - 1];
        } else {
            previous = this.folds[this.folds.length - 1];
        }
        if (previous || previous === 0) {
            this.moveCursor(previous);
        }
    },

    nextFold() {
        //console.log(arguments.callee.name);
        var fold = this.foldNavigatorView.getActiveFold();
        var index = this.folds.indexOf(fold);
        var next;
        var editor = atom.workspace.getActiveTextEditor();
        if (!editor)
            return;

        if (this.folds.length !== (index + 1)) {
            next = this.folds[index + 1];
        } else {
            next = this.folds[0];
        }
        if (next || next === 0) {
            this.moveCursor(next);
        }
    },

    previousFoldAtCurrentLevel() {

        //console.log(arguments.callee.name);
        var fold = this.foldNavigatorView.getActiveFold();
        var previous;
        var editor = atom.workspace.getActiveTextEditor();
        if (!editor)
            return;

        var indentation = 0;

        if (fold || fold === 0) {
            indentation = editor.indentationForBufferRow(fold);
        }

        var level = this.getLevel(indentation);
        console.log('level');
        console.log(level);
        var index = level.indexOf(fold);

        if (index !== 0) {
            previous = level[index - 1];
        } else {
            previous = level[level.length - 1];
        }

        if (previous || previous === 0) {
            this.moveCursor(previous);
        }
    },

    nextFoldAtCurrentLevel() {
        //console.log(arguments.callee.name);
        var fold = this.foldNavigatorView.getActiveFold();
        var next;
        var editor = atom.workspace.getActiveTextEditor();
        if (!editor)
            return;

        var indentation = 0;
        if (fold) {
            indentation = editor.indentationForBufferRow(fold);
        }

        var level = this.getLevel(indentation);
        if (!level)
            return;

        var index = level.indexOf(fold);

        if (level.length !== (index + 1)) {
            next = level[index + 1];
        } else {
            next = level[0];
        }
        if (next || next === 0) {
            this.moveCursor(next);
        }
    },

    moveLevelUp() {

        var fold = this.foldNavigatorView.getActiveFold();
        var foldObj = this.foldObjects[fold] ? this.foldObjects[fold] : false;

        var editor = atom.workspace.getActiveTextEditor();
        var parent;

        if (!editor || !foldObj) {
            return;
        }

        parent = this.getParentFold(foldObj);

        if ((parent || parent === 0) && parent !== 'root') {
            this.moveCursor(parent);
            this.addToHistory(fold);
        }
    },

    moveLevelDown() {
        var fold = this.foldNavigatorView.getActiveFold();
        var foldObj = this.foldObjects[fold] ? this.foldObjects[fold] : false;
        var editor = atom.workspace.getActiveTextEditor();
        var child;

        if (!editor || !foldObj || foldObj.children.length === 0) {
            return;
        }

        child = this.getLastFromHistory();

        // check if the last item in history actually belongs to this parent
        if (!child || foldObj.children.indexOf(child) === -1)
            child = foldObj.children[0];

        if (child) {
            this.moveCursor(child);
        }
    },

    getParentFold(foldObj) {
        if (!foldObj) {
            return false;
        }

        // badly indented/formated code - there must be a parent so return the previous fold the next best chance of being the parent
        if (foldObj.parent === 'root' && foldObj.indentation > 0) {
            let index = this.folds.indexOf(foldObj.line);
            let prev = this.folds[index - 1];
            return prev ? prev : false;
        }

        return foldObj.parent;
    },

    addToHistory(fold) {
        var maxSize = 10;
        if (!this.history) {
            this.history = [];
        } else if (this.history.length > maxSize) {
            this.history.shift();
        }

        this.history.push(fold);
    },

    getLastFromHistory() {
        if (!this.history) {
            return undefined;
        }

        return this.history.pop();
    },

    clearHistory() {
        if (!this.history)
            return;
        this.history.length = 0;
    },

    // gets all folds at indentation level
    getLevel(level) {
        //console.log(arguments.callee.name);
        return this.foldLevels[level];
    },

    parse(editor) {
        //console.log(arguments.callee.name);
        if (!editor)
            return;

        // initialize
        this.iniSettings();
        this.foldNavigatorView.clearContent();
        this.clearHistory();
        this.lines2fold = [];
        this.folds = [];
        this.foldObjects = {};
        this.foldLevels = {};

        var numberOfRows = editor.getLastBufferRow();
        var html = "";
        var currentFold = null;
        var temporarilyLastParent = [];

        //loop through the lines of the active editor
        for (var i = 0; numberOfRows > i; i++) {
            if (editor.isFoldableAtBufferRow(i)) {

                let indentLevel = editor.indentationForBufferRow(i);
                let indentHtml = "";
                let lineNumberSpan = "";
                let lineContent = "";
                let classList = "fold-navigator-item";
                let id = "";
                let gutter = '<span class="fold-navigator-gutter"></span>';
                let content = '';
                let parent;

                // add this line to folds
                this.folds.push(i);

                // add this line to foldLevels
                if (!this.foldLevels.hasOwnProperty(indentLevel)) {
                    this.foldLevels[indentLevel] = [];
                }

                this.foldLevels[indentLevel].push(i);

                // chop array down - it can not be larger than the current indentLevel
                temporarilyLastParent.length = parseInt(indentLevel);

                parent = 'root';

                if (temporarilyLastParent[indentLevel - 1] || temporarilyLastParent[indentLevel - 1] === 0)
                    parent = temporarilyLastParent[indentLevel - 1];

                if (this.foldObjects[parent]) {
                    this.foldObjects[parent]['children'].push(i);
                }

                this.foldObjects[i] = {
                    line: i,
                    children: [],
                    parent: parent,
                    indentation: indentLevel
                };

                //temporarilyLastParent
                temporarilyLastParent[indentLevel] = i;

                currentFold = i;

                for (let j = 0; j < indentLevel; j++) {
                    indentHtml += '<span class="fold-navigator-indentation">' + this.settings.indentationCharacter + '</span>';
                }

                lineContent = editor.lineTextForBufferRow(i);

                // check if the line is longer than the minimum in the settings if not grab the next line instead
                if (lineContent.trim().length < this.settings.minLineLength) {
                    lineContent = editor.lineTextForBufferRow(i + 1);
                }

                // check if line is too long
                if (lineContent.length > this.settings.maxLineContentLength) {
                    lineContent = lineContent.substring(0, this.settings.maxLineContentLength) + '...';
                }

                /* maybe in the future we should check for lines which are too short and grab the next row */
                if (this.settings.showLineNumbers) {
                    lineNumberSpan = '<span class="fold-navigator-line-number">' + (i + 1) + '</span>';
                }

                id = 'fold-navigator-item-' + i;
                classList += ' fold-navigator-item-' + i;
                classList += ' fold-navigator-item-indent-' + indentLevel;

                // escape html
                content = document.createElement('div');
                content.appendChild(document.createTextNode(lineContent));

                html += '<div id="' + id + '" class="' + classList + '" data-row="' + i + '">' + gutter + lineNumberSpan + indentHtml + content.innerHTML + '</div>';
            }

            // add this fold to the line2fold lookup array
            this.lines2fold[i] = currentFold;
        }

        this.foldNavigatorView.setContent(html);
        this.selectRow(editor.getCursorBufferPosition().row);
    },

    /* called every time onCursorChange */
    selectRow(row) {
        //console.log(arguments.callee.name);
        var fold = this.lines2fold[row];
        var line = this.foldNavigatorView.selectFold(fold);

        // autoscroll navigator panel
        if (line && !this.wasItOnClick && this.settings.autoScrollFoldNavigatorPanel) {
            line.scrollIntoView();
        }
        if (line) {
            this.wasItOnClick = false;
        }

    },

    // not yet used idea stolen from tree view
    resizeStarted() {
        document.onmousemove = () => {
            this.resizePanel()
        };
        document.onmouseup = () => {
            this.resizeStopped()
        };
    },

    // not yet used idea stolen from tree view
    resizeStopped() {
        document.offmousemove = () => {
            this.resizePanel()
        };
        document.offmouseup = () => {
            this.resizeStopped()
        };
    },

    // not yet used idea stolen from tree view
    resizePanel(d) {
        var pageX = d.pageX;
        var which = d.which;
        if (which !== 1) {
            return this.resizeStopped();
        }
    },

    toggle() {
        return (this.panel.isVisible() ? this.panel.hide() : this.panel.show());
    },

    open() {
        var editor = atom.workspace.getActiveTextEditor();
        return this.panel.show();
    },

    close() {
        return this.panel.hide();
    },

    moveCursor(row, wasItOnClick = false) {
        //console.log(arguments.callee.name);
        this.wasItOnClick = wasItOnClick;
        // setCursorBufferPosition dies if row is string
        row = parseInt(row);
        var editor = atom.workspace.getActiveTextEditor();
        if (!editor)
            return;

        //editor.unfoldBufferRow(row);
        if (this.settings.keepFoldingAllTime && !wasItOnClick) {
            editor.foldAll();
        }

        this.unfoldSubfolds(row);
        editor.setCursorBufferPosition([row, 0]);
        editor.scrollToCursorPosition({
            center: true
        });
    },

    navigatorElementOnClick() {
        //console.log(arguments.callee.name);
        var element = this.foldNavigatorView.getElement();

        element.onclick = (event) => {

            var clicked = null;
            var row;
            var editor = atom.workspace.getActiveTextEditor();

            if (event.target.matches('.fold-navigator-item')) {
                clicked = event.target;
            } else if (event.target.matches('.fold-navigator-indentation') && event.target.parentNode && event.target.parentNode.matches('.fold-navigator-item')) {
                clicked = event.target.parentNode;
            }

            if (!clicked)
                return;

            row = clicked.dataset.row;

            if (!row)
                return;

            if (editor && ((this.settings.keepFolding && !event.metaKey) || (!this.settings.keepFolding && event.metaKey))) {
                // fold all code before anything else sadly this triggers a lot of onDidChangeCursorPosition events
                editor.foldAll();
            }

            this.moveCursor(row, true);
        };
    },

    unfoldSubfoldsPublic() {
        this.unfoldSubfolds(false, false, true);
    },

    unfoldSubfolds(row = false, editor = false, force = false) {
        //console.log(arguments.callee.name);

        var fold = row ? row : this.foldNavigatorView.getActiveFold();
        var foldObj = this.foldObjects[fold];
        var editor = editor ? editor : atom.workspace.getActiveTextEditor();

        if (!foldObj || !editor)
            return;

        editor.unfoldBufferRow(fold);

        if (!this.settings.unfoldAllSubfolds && !force)
            return;

        if (foldObj.children.length > 0) {
            foldObj.children.forEach(
                (value) => {
                    this.unfoldSubfolds(value, editor)
                        //editor.unfoldBufferRow(value);
                }
            );
        }
    },

    unfoldAtLevel(level) {
        var editor = atom.workspace.getActiveTextEditor();
        if (!editor)
            return;

        if ([1, 2, 3, 4, 5].indexOf(level) < 0)
            return;

        var lev = this.getLevel(level - 1);
        if (lev) {
            lev.forEach((fold) => {
                editor.unfoldBufferRow(fold);
            });
            editor.scrollToCursorPosition({
                center: true
            });
        }
    },

    foldAtLevel(level) {
        var editor = atom.workspace.getActiveTextEditor();
        if (!editor)
            return;

        if ([1, 2, 3, 4, 5].indexOf(level) < 0)
            return;

        var lev = this.getLevel(level - 1);
        if (lev) {
            lev.forEach((fold) => {
                editor.foldBufferRow(fold);
            });
            editor.scrollToCursorPosition({
                center: true
            });
        }

    },

    toggleFoldsLevel(level) {

        var editor = atom.workspace.getActiveTextEditor();
        if (!editor)
            return;

        if ([1, 2, 3, 4, 5].indexOf(level) < 0)
            return;

        var lev = this.getLevel(level - 1);
        if (!lev)
            return;

        var first = lev[0];
        if (!first && first !== 0)
            return;

        if (editor.isFoldedAtBufferRow(first)) {
            this.unfoldAtLevel(level);
        } else {
            this.foldAtLevel(level);
        }

    },

    unfoldAtLevel1() {
        this.unfoldAtLevel(1);
    },

    unfoldAtLevel2() {
        this.unfoldAtLevel(2);
    },

    unfoldAtLevel3() {
        this.unfoldAtLevel(3);
    },

    unfoldAtLevel4() {
        this.unfoldAtLevel(4);
    },

    unfoldAtLevel5() {
        this.unfoldAtLevel(5);
    },

    foldAtLevel1() {
        this.foldAtLevel(1);
    },

    foldAtLevel2() {
        this.foldAtLevel(2);
    },

    foldAtLevel3() {
        this.foldAtLevel(3);
    },

    foldAtLevel4() {
        this.foldAtLevel(4);
    },

    foldAtLevel5() {
        this.foldAtLevel(5);
    },

    toggleFoldsLevel1() {
        this.toggleFoldsLevel(1);
    },

    toggleFoldsLevel2() {
        this.toggleFoldsLevel(2);
    },

    toggleFoldsLevel3() {
        this.toggleFoldsLevel(3);
    },

    toggleFoldsLevel4() {
        this.toggleFoldsLevel(4);
    },

    toggleFoldsLevel5() {
        this.toggleFoldsLevel(5);
    },

    deactivate() {
        //console.log(arguments.callee.name);
        this.panel.destroy();
        this.subscriptions.dispose();
        this.foldNavigatorView.destroy();

        if (this.onDidChangeCursorPositionSubscription) {
            this.onDidChangeCursorPositionSubscription.dispose();
        }

        if (this.onDidStopChangingSubscription) {
            this.onDidStopChangingSubscription.dispose();
        }
    },

    /* we don't need this */
    serialize() {}

};
