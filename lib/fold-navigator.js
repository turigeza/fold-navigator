'use babel';
//showSearch
import FoldNavigatorView from './fold-navigator-view';
import fuzzaldrinPlus from 'fuzzaldrin-plus';
import _ from 'lodash';


import {
    CompositeDisposable
} from 'atom';

export default {
    config: {
        autofold: {
            title: 'Autofold on open',
            description: 'Autofold all folds when you open a document. config.cson key : autofold',
            type: 'boolean',
            default: false
        },
        keepFolding: {
            title: 'Keep code folded.',
            description: 'Everytime you click on one of the fold navigator element all code folds will be folded before the selected fold opens. Usefull if you want to keep your code folded all the time. Note that if you are using ctrl-alt-cmd-up/down keys to navigate it will not close the folds. Also you can temporarily enable/disable this behaviour by holding down the option key while you click. config.cson key : keepFolding',
            type: 'boolean',
            default: false
        },
        showLineNumbers: {
            title: 'Show line number.',
            description: 'Show line numbers in fold navigator. config.cson key : showLineNumbers',
            type: 'boolean',
            default: true
        },
        indentationCharacter: {
            title: 'Indentation character.',
            description: 'The character used for indentation in the fold navigator panel. config.cson key : indentationCharacter',
            type: 'string',
            default: 'x'
        },
        maxLineContentLength: {
            title: 'Maximum line length.',
            description: 'Fold Navigator will take the line on which the fold is on but if the line is longer than this many characters then it will truncate it. config.cson key : maxLineContentLength',
            type: 'integer',
            default: 60
        },
        minLineLength: {
            title: 'Minimum line length.',
            description: 'Sometimes the fold falls on line which contains very little information. Typically comments like /** are meaningless. If the line content is less then this many characters use the next line for the fold description. config.cson key : minLineLength',
            type: 'integer',
            default: 6
        },
        keepFoldingAllTime: {
            title: 'Keep code folded even on shortcuts.',
            description: 'It will fold all folds before opening a new one. config.cson key : keepFoldingAllTime',
            type: 'boolean',
            default: false
        },
        autoScrollFoldNavigatorPanel: {
            title: 'Auto scroll fold navigator panel.',
            description: 'Scrolls the fold navigator panel to the active fold. config.cson key : autoScrollFoldNavigatorPanel',
            type: 'boolean',
            default: true
        },
        unfoldAllSubfolds: {
            title: 'Unfold all subfolds.',
            description: 'When a fold is selected/active all subfolds will be unfolded as well. When you have lots of subfolds to open this can be sluggish. config.cson key : unfoldAllSubfolds',
            type: 'boolean',
            default: true
        },
        maxFoldLevel: {
            title: 'Maximum fold level fold navigator will list.',
            description: 'It is possibly not much use listing every single fold. With this option you can limit the fold level depth we list on the panel hopefully giving you a better overview of the code. config.cson key : maxFoldLevel',
            type: 'integer',
            default: 10,
        },
        whenMatchedUsePreviousLine: {
            title: 'Previous line should be used for description.',
            description: 'Comma separated values. If the content of the line matches any of these values the previous line is going to be used for the fold description. This is so that we avoid listing just a single bracket for example which would be pretty meaningless.',
            type: 'string',
            default: '{,{ ',
        },
        log: {
            title: 'Turn on logging',
            description: 'It might help to sort out mysterious bugs.',
            type: 'boolean',
            default: false,
        },
    },

    activate(state) {
        //console.log(arguments.callee.name);
        /*
        this.settings = null;
        */
        this.settings = null;
        this.iniSettings();

        /*
        this.lines2fold = [];
        Key is the line number and the value is the line number of the last fold looped through in the document.
        currently the fold ending are not observed maybe I should change this in the future note that we will work with the line numbers displayed and not the actuall line number which can be 0
        */
        this.lines2fold = [];

        /*
        this.folds = [];
        array of row numbers where the folds are
        */
        this.folds = [];

        /*
        this.visibleFolds = [];
        same as this.folds but limited by this.settings.maxFoldLevel
        */
        this.visibleFolds = [];

        /*
        this.foldObjects = {};
        we need this to be able to navigate levels an example bellow see this.parse it should really be a new Map();
        {
            line: i,
            children: [],
            parent: parent,
            indentation: indentLevel,
            content: '',
        }
        */

        this.foldObjects = {};

        /*
        exactly the same as
        this.foldObjects but came later because of fuzzaldrin-plus which only seems to work with arrays as far as I can tell
        */
        this.foldObjectsArray = [];

        /*
        this.foldLevels = {};
        row numbers of the folds orgenised by level usefull for the commands which fold unfold levels
        */
        this.foldLevels = {};

        /*
        this.history = [];
        only used as a short term log  so that we can navigate fold level down
        */
        this.history = [];

        /*
        this.activeFold
        line number of the fold which we are on this is what gets highlighted on the fold navigator panel item
        */
        this.activeFold = null;

        // subscriptions
        this.subscriptions = new CompositeDisposable();

        this.onDidChangeCursorPositionSubscription = null;

        this.foldNavigatorView = new FoldNavigatorView(state.foldNavigatorViewState);

        // when active pane item changed parse code and change content of navigator panel
        atom.workspace.observeActivePaneItem((pane) => {
            this.observeActivePaneItem(pane)
        });

        // parse content of editor each time it stopped changing
        atom.workspace.observeTextEditors((editor) => {
            this.observeTextEditors(editor)
        });

        // attach onclick event to the fold navigator lines
        this.navigatorElementOnClick();
        this.registerCommands();

        /*
        this.panel = null;
        foldnavigator panel
        */
        this.panel = null;
        this.addNavigatorPanel();

        /*
        this.searchModal
        */
        this.searchModal = null;
        this.searchModalElement = null;
        this.searchModalInput = null;
        this.searchModalItems = null;
        this.addSearchModal();

    },

    // observer text editors coming and going
    observeTextEditors(editor) {
        //console.log(arguments.callee.name);

        if (this.settings && this.settings.autofold && editor){
            editor.foldAll();
        }

    },

    // every time the active pane changes this will get called
    observeActivePaneItem(pane) {
        //console.log(arguments.callee.name);

        var editor = atom.workspace.getActiveTextEditor();
        var listener;
        var editorView;

        if (!editor)
            return;

        //dispose of previous subscription
        if (this.onDidChangeCursorPositionSubscription) {
            this.onDidChangeCursorPositionSubscription.dispose();
        }

        // follow cursor in fold navigator register subscription so that we can remove it
        this.onDidChangeCursorPositionSubscription = editor.onDidChangeCursorPosition(
          _.debounce((event) => this.onDidChangeCursorPosition(event), 500)
        );

        //dispose of previous subscription
        if (this.onDidStopChangingSubscription) {
            this.onDidStopChangingSubscription.dispose();
        }

        // if document changed subscription
        this.onDidStopChangingSubscription = editor.onDidStopChanging(
          _.debounce((event) => this.parse(editor), 500)
        );

        this.parse(editor);
    },

    clearSearchModal() {
        if (!this.searchModal)
            return;

        this.searchModalItems.innerHTML = '';

        this.searchModalInput.value = '';
    },

    alignEditorToSearch() {
        var selectedArr = this.searchModalItems.getElementsByClassName('fold-navigator-search-modal-item-selected');
        var selected = selectedArr[0];
        var editor = atom.workspace.getActiveTextEditor();
        if (selected && selected.dataset.row >= 0) {
            this.moveCursor(selected.dataset.row, false);
        }
    },

    searchModalOnClick(event) {

        var row;
        var editor = atom.workspace.getActiveTextEditor();
        var clicked = null;

        this.hideSearch();

        if (event.target.matches('.fold-navigator-search-modal-item')) {
            clicked = event.target;
        } else if (event.target.matches('.fold-navigator-indentation') && event.target.parentNode && event.target.parentNode.matches('.fold-navigator-search-modal-item')) {
            clicked = event.target.parentNode;
        }

        if (!clicked)
            return;

        row = clicked.dataset.row;

        //problem
        if (!row)
            return;

        this.moveCursor(row, false);

    },

    addSearchModal() {

        this.searchModalElement = document.createElement('div');
        this.searchModalElement.classList.add('fold-navigator-search-modal');
        this.searchModalElement.classList.add('native-key-bindings');
        this.searchModalInput = document.createElement('input');
        this.searchModalItems = document.createElement('div');

        this.searchModalElement.appendChild(this.searchModalInput);
        this.searchModalElement.appendChild(this.searchModalItems);

        this.searchModal = atom.workspace.addModalPanel({
            item: this.searchModalElement,
            visible: false
        });

        // on blur
        this.searchModalInput.addEventListener('blur', (event) => {
            // delay hiding because of the on click event won't fire otherwise WHAT an ugly way to solve it :)
            setTimeout(() => {
                this.hideSearch();
            }, 200);
        });

        // on click
        this.searchModalElement.addEventListener('click', (event) => {
            this.searchModalOnClick(event);
        }, true);

        // on input
        this.searchModalInput.addEventListener('input', () => {
            this.searchModalItems.innerHTML = '';

            var query = this.searchModalInput.value;

            if (!query || query.length < 1)
                return;

            var filteredItems = fuzzaldrinPlus.filter(this.foldObjectsArray, query, {
                key: 'content'
            });

            var html = '';

            filteredItems.forEach((item, index) => {

                let selected = ' fold-navigator-search-modal-item-selected';
                if (index > 0) {
                    selected = '';
                }

                //let html2add = '<div id="' + id + '" class="' + classList + '" data-row="' + i + '">' + gutter + lineNumberSpan + indentHtml + content.innerHTML + '</div>';
                let indentHtml = '';

                for (let j = 0; j < item.indentation; j++) {
                    indentHtml += '<span class="fold-navigator-indentation">' + this.settings.indentationCharacter + '</span>';
                }

                html += '<div class="fold-navigator-search-modal-item fold-navigator-item-indent-' + item.indentation + selected + '" data-row="' + item.line + '">' + indentHtml + item.content + '</div>';
            });

            this.searchModalItems.innerHTML = html;
            //var matches = fuzzaldrinPlus.match(displayName, this.searchModalInput.value);
            //filterQuery box from text input
            //items ??
            // { key: @getFilterKey() }
        });

        this.searchModalElement.addEventListener('keydown', (e) => {

            var sc = 'fold-navigator-search-modal-item-selected';

            if (e.keyCode === 38 || e.keyCode === 40 || e.keyCode == 13 || e.keyCode == 27) {
                var items = this.searchModalItems.getElementsByClassName('fold-navigator-search-modal-item');

                if (!items)
                    return;

                // remove selected
                var selectedArr = this.searchModalItems.getElementsByClassName(sc);
                var selected = selectedArr[0];

                if (selected) {
                    selected.classList.remove(sc);
                }

                var first = items[0] ? items[0] : false;
                var last = items[items.length - 1] ? items[items.length - 1] : false;
                var next = null;

                if (e.keyCode === 38) {
                    // up
                    if (selected) {
                        next = selected.previousElementSibling;
                    }
                } else if (e.keyCode === 40) {

                    // down
                    if (selected) {
                        next = selected.nextElementSibling;
                    }
                } else if (e.keyCode === 27) {
                    // esc
                    this.hideSearch();
                } else if (e.keyCode == 13) {
                    // enter
                    if (selected) {
                        if (selected.dataset.row >= 0) {
                            let editor = atom.workspace.getActiveTextEditor();
                            this.moveCursor(selected.dataset.row, false);
                            this.hideSearch();
                        }
                    }
                }

                // end of line or not selected
                if (!next) {
                    if (e.keyCode === 38)
                        next = last;
                    else {
                        next = first;
                    }
                }

                if (next) {
                    next.classList.add(sc);
                }
            }

        });


        //var matches = fuzzaldrinPlus.match(displayName, filterQuery)


    },

    hideSearch() {
        this.searchModal.hide();
        let editor = atom.workspace.getActiveTextEditor();
        if (editor)
            atom.views.getView(editor).focus();
    },

    showSearch() {
        if (!editor)
            return;
        this.searchModal.show();
        this.searchModalInput.focus();
        this.searchModalInput.select();
    },

    toggleSearch() {
        var editor = atom.workspace.getActiveTextEditor();
        if (!editor)
            return;

        if (this.searchModal.isVisible()) {
            this.searchModal.hide();
            atom.views.getView(editor).focus();
        } else {
            this.searchModal.show();
            this.searchModalInput.focus();
            this.searchModalInput.select();
        }

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

        var languageSettings = null;

        if (editor) {
            let scope = editor.getGrammar().scopeName;
            languageSettings = atom.config.get('fold-navigator', {
                'scope': [scope]
            });
        }

        this.settings = atom.config.get('fold-navigator');

        if (languageSettings){
            Object.assign(this.settings, languageSettings);
        }

        // parse the comma separated string whenMatchedUsePreviousLine
        if(this.settings.whenMatchedUsePreviousLine && this.settings.whenMatchedUsePreviousLine.trim() != ''){
            this.settings.whenMatchedUsePreviousLineArray = this.settings.whenMatchedUsePreviousLine.split(',');
            if(this.settings.whenMatchedUsePreviousLineArray.constructor !== Array){
                this.settings.whenMatchedUsePreviousLineArray = null;
            }
        }
    },

    registerCommands() {
        //"ctrl-alt-cmd-up": "fold-navigator:previousFoldAtCurrentLevel",
        //"ctrl-alt-cmd-down": "fold-navigator:nextFoldAtCurrentLevel",
        //"ctrl-alt-cmd-up": "fold-navigator:previousFold",
        //"ctrl-alt-cmd-down": "fold-navigator:nextFold",
        //
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
            'fold-navigator:foldActive': () => this.foldActivePublic()
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
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'fold-navigator:toggleActiveFold': () => this.toggleActiveFold()
        }));

    },

    previousFold() {
        if (this.searchModal.isVisible()) {
            this.alignEditorToSearch();
            return;
        }

        var folds = this.visibleFolds;
        if (!folds || folds.length === 0)
            return;

        //console.log(arguments.callee.name);
        this.clearHistory();
        var fold = this.foldNavigatorView.getActiveFold();
        var index = folds.indexOf(fold);
        var previous;
        var editor = atom.workspace.getActiveTextEditor();
        if (!editor)
            return;

        if (index !== 0) {
            previous = folds[index - 1];
        } else {
            previous = folds[folds.length - 1];
        }
        if (previous || previous === 0) {
            this.moveCursor(previous);
        }
    },

    nextFold() {
        if (this.searchModal.isVisible()) {
            this.alignEditorToSearch();
            return;
        }

        //console.log(arguments.callee.name);
        this.clearHistory();

        var folds = this.visibleFolds;
        if (!folds || folds.length === 0)
            return;

        var fold = this.foldNavigatorView.getActiveFold();
        var index = folds.indexOf(fold);
        var next;
        var editor = atom.workspace.getActiveTextEditor();

        if (!editor)
            return;

        if (folds.length !== (index + 1)) {
            next = folds[index + 1];
        } else {
            next = folds[0];
        }
        if (next || next === 0) {
            this.moveCursor(next);
        }
    },

    previousFoldAtCurrentLevel() {
        if (this.searchModal.isVisible()) {
            this.alignEditorToSearch();
            return;
        }
        //console.log(arguments.callee.name);
        this.clearHistory();
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
        if (!level)
            return;

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
        if (this.searchModal.isVisible()) {
            this.alignEditorToSearch();
            return;
        }

        this.clearHistory();
        //console.log(arguments.callee.name);
        var fold = this.foldNavigatorView.getActiveFold();
        var next;
        var editor = atom.workspace.getActiveTextEditor();
        if (!editor)
            return;

        var indentation = 0;
        if (fold || fold === 0) {
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
        if (this.searchModal.isVisible()) {
            this.alignEditorToSearch();
            return;
        }
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
        if (this.searchModal.isVisible()) {
            this.alignEditorToSearch();
            return;
        }

        var fold = this.foldNavigatorView.getActiveFold();
        var foldObj = this.foldObjects[fold] ? this.foldObjects[fold] : false;
        var editor = atom.workspace.getActiveTextEditor();
        var child;

        if (!editor || !foldObj || foldObj.children.length === 0) {
            return;
        }

        child = this.getLastFromHistory();

        // check if the last item in history actually belongs to this parent
        if (!child && foldObj.children.indexOf(child) === -1)
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
            if (prev || prev === 0)
                return prev;
            return false;
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

        this.clearSearchModal();
        this.foldNavigatorView.clearContent();
        this.clearHistory();
        this.lines2fold = [];
        this.folds = [];
        this.visibleFolds = [];
        this.foldObjects = {};
        this.foldObjectsArray = []; // we need this because fuzzaldrin-plus not able to find things in objects only in arrays or I do not know how
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
                let lineContentTrimmed = "";
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
                    indentation: indentLevel,
                    content: '',
                };

                //temporarilyLastParent
                temporarilyLastParent[indentLevel] = i;

                for (let j = 0; j < indentLevel; j++) {
                    indentHtml += '<span class="fold-navigator-indentation">' + this.settings.indentationCharacter + '</span>';
                }

                lineContent = editor.lineTextForBufferRow(i);

                lineContentTrimmed = lineContent.trim();

                // check if the content of the string matches one of those values when the previous line's content should be used instead
                // see issue here https://github.com/turigeza/fold-navigator/issues/12
                if(this.settings.whenMatchedUsePreviousLineArray && this.settings.whenMatchedUsePreviousLineArray.indexOf(lineContentTrimmed) !== -1){ //&& i !== 0
                    lineContent = editor.lineTextForBufferRow(i - 1);
                }else if (lineContentTrimmed.length < this.settings.minLineLength) {
                    // check if the line is longer than the minimum in the settings if not grab the next line instead
                    lineContent = editor.lineTextForBufferRow(i + 1);
                }

                // default it to string seems to return undefined sometimes most likely only when the first row is {
                if(!lineContent){
                    lineContent = '';
                }

                // check if line is too long
                if (lineContent.length > this.settings.maxLineContentLength) {
                    lineContent = lineContent.substring(0, this.settings.maxLineContentLength) + '...';
                }

                /* maybe in the future we should check for lines which are too short and grab the next row */
                if (this.settings.showLineNumbers) {
                    lineNumberSpan = '<span class="fold-navigator-line-number ">' + (i + 1) + '</span>';
                }

                id = 'fold-navigator-item-' + i;
                classList += ' fold-navigator-item-' + i;
                classList += ' fold-navigator-item-indent-' + indentLevel;

                // escape html
                // add content to navigator
                if (indentLevel <= this.settings.maxFoldLevel) {
                    currentFold = i;
                    content = document.createElement('div');
                    content.appendChild(document.createTextNode(lineContent));
                    html += '<div id="' + id + '" class="' + classList + '" data-row="' + i + '">' + gutter + lineNumberSpan + indentHtml + content.innerHTML + '</div>';
                    this.foldObjects[i]['content'] = lineContent.trim();
                    this.foldObjectsArray.push(this.foldObjects[i]);
                    this.visibleFolds.push(i);
                }
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
        if ((line) && !this.wasItOnClick && this.settings.autoScrollFoldNavigatorPanel) {
            line.scrollIntoViewIfNeeded(false);
            if(this.settings.log){
                console.log(line);
            }
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
        if (!editor || row < 0)
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

            //problem
            if (!row)
                return;

            if (editor && ((this.settings.keepFolding && !event.metaKey) || (!this.settings.keepFolding && event.metaKey))) {
                // fold all code before anything else sadly this triggers a lot of onDidChangeCursorPosition events
                editor.foldAll();
            }

            this.moveCursor(row, true);
        };
    },

    foldActivePublic() {
        //console.log(arguments.callee.name);
        var fold = this.foldNavigatorView.getActiveFold();
        var editor = atom.workspace.getActiveTextEditor();

        if ((!fold && fold !== 0) || !editor)
            return;

        editor.foldBufferRow(fold);

    },

    unfoldSubfoldsPublic() {
        //console.log(arguments.callee.name);
        this.unfoldSubfolds(false, false, true);
    },

    unfoldSubfolds(row = false, editor = false, force = false) {
        //console.log(arguments.callee.name);

        var fold = (row || row === 0) ? row : this.foldNavigatorView.getActiveFold();

        if (!fold && fold !== 0)
            return;

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
                }
            );
        }
    },

    toggleActiveFold() {
        //console.log(arguments.callee.name);
        var fold = this.foldNavigatorView.getActiveFold();
        var editor = atom.workspace.getActiveTextEditor();

        if ((!fold && fold !== 0) || !editor)
            return;

        if (editor.isFoldedAtBufferRow(fold)) {
            this.unfoldSubfolds(fold, editor, true);
        } else {
            editor.foldBufferRow(fold);
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

    startTime() {
        this.time = new Date();
    },

    showTime(text) {
        console.log(text);
        console.log(new Date() - this.time);
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

        //delete(this.searchModalElement);
        //delete(this.searchModalItems);
        //delete(this.searchModalInput);

        if (this.searchModal) {
            this.searchModal.destroy();
        }
    },

    /* we don't need this */
    serialize() {}

};
