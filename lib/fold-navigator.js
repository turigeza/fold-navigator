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
    },

    foldNavigatorView: null,
    panel: null,
    subscriptions: null,
    lines2fold: [],
    activeFold: null,
    activeEditor: null, // the active editor

    activate(state) {
        //console.log(arguments.callee.name);

        /* THIS.VARS;
        this.settings = null;
        this.foldNavigatorView = null;
        this.folds = []; // array of line numbers where the fold in the editor are
        /*
        this.lines2fold
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

        // parse content of editor each time it stopped changing
        atom.workspace.observeTextEditors((editor) => {
            this.observeTextEditors(editor)
        });

        // when active pane item changed parse code and change content of navigator panel
        atom.workspace.observeActivePaneItem((pane) => {
            this.observeActivePaneItem(pane)
        });
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
        var listener = null;
        if (!editor)
            return;

        this.parse(editor);

        // clear previous subscriptions on editor changes
        /* for some reason this does not work maybe because editor is changed by now
        this.editorSubscriptions.dispose();

        // add new subscriptions
        this.editorSubscriptions.add(editor.onDidChangeCursorPosition((event) => {
            this.onDidChangeCursorPosition(event)
        }));

        this.editorSubscriptions.add(editor.onDidStopChanging((editor) => {
            this.parse(editor)
        }));
        */

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
        this.settings = atom.config.get('fold-navigator');

        // watch for changes in settings so we don't have to reload atom window for it to take effect
        atom.config.observe('fold-navigator', (updatedSettings) => {
            this.settings = updatedSettings;
            return;
        });

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
            'fold-navigator:moveUp': () => this.moveUp()
        }));
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'fold-navigator:moveDown': () => this.moveDown()
        }));
    },

    parse(editor) {
        //console.log(arguments.callee.name);
        if (!editor)
            return;

        // initialize
        this.foldNavigatorView.clearContent();
        this.lines2fold = [];
        this.folds = [];

        var numberOfRows = editor.getLastBufferRow();
        var html = "";
        var currentFold = null;

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

                // add this line to folds
                this.folds.push(i);

                currentFold = i;

                for (let j = 0; j < indentLevel; j++) {
                    indentHtml += '<span class="fold-navigator-indentation">' + this.settings.indentationCharacter + '</span>';
                }

                lineContent = editor.lineTextForBufferRow(i);

                // check if the line is longer than the minimum in the settings if not grab the next line instead
                if (lineContent.length < this.settings.minLineLength) {
                    lineContent = editor.lineTextForBufferRow(i+1);
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

    selectRow(row) {
        //console.log(arguments.callee.name);
        var fold = this.lines2fold[row];
        this.foldNavigatorView.selectFold(fold);
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
        return this.panel.show();
    },

    close() {
        return this.panel.hide();
    },

    moveUp() {
        var fold = this.foldNavigatorView.getActiveFold();
        var index = this.folds.indexOf(fold);
        var previous;
        var editor = atom.workspace.getActiveTextEditor();

        if (index !== 0) {
            previous = this.folds[index - 1];
        } else {
            previous = this.folds[this.folds.length - 1];
        }

        this.moveCursor(previous);
    },

    moveDown() {
        var fold = this.foldNavigatorView.getActiveFold();
        var index = this.folds.indexOf(fold);
        var next;
        var editor = atom.workspace.getActiveTextEditor();

        if (this.folds.length !== (index + 1)) {
            next = this.folds[index + 1];
        } else {
            next = this.folds[0];
        }

        this.moveCursor(next);
    },

    moveCursor(row) {
        // setCursorBufferPosition dies if row is string
        row = parseInt(row);
        var editor = atom.workspace.getActiveTextEditor();
        if (!editor)
            return;

        editor.unfoldBufferRow(row);
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

            this.moveCursor(row);
        };
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
