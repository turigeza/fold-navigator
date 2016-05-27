# fold-navigator package

It helps you navigate your code folding points within Atom. It takes the lines where the folding points are and lists them with their indentation to give you an overview of your code. It serves a similar purpose to the minimap package but with a different approach.

I was missing Netbeans code navigator so much I had to come up with something which helps me navigate through my code in Atom.

Things it can do.

### 1. List all the folding points.
![List all the folding points.](https://raw.githubusercontent.com/turigeza/fold-navigator/master/resources/all_folding_points.png)

### 2. Search your folding points.
![A screenshot of your package](https://raw.githubusercontent.com/turigeza/fold-navigator/master/resources/fold_search.png)

### 3. You can limit the depth it will lists.
You might not care what is at indentation level 5. You could use this if you only wanted to see let's say a list of methods in a class.
This is a screen shot where max indentation is set to 1.
![A screenshot of your package](https://raw.githubusercontent.com/turigeza/fold-navigator/master/resources/limited_folds_search.png)

And other less important things such as:

### 4. Keep your code folded at all time.
If you are into that kind of thing. Since I can see my fold points in the navigator panel for me actually now easier not to fold my code at all. But it's there if you prefer it this way.

### 5. Toggle folds at level 1, 2, 3, 4 , 5 ctrl+1. ctrl+2 etc ... ,

### 6. Toggle sub folds.
Typically atom will only unfold the very fold you have clicked on and not the the folds under it. This command will toggle all sub folds within a fold. Currently it is assigned to ctrl-alt-cmd-/ and yes it would be nicer if I could override the double click atom opens fold with but I don't yet know ho to do that. So maybe in the future.

### 7. It gives you the option to fold all code on file open.

### 8. Per language/gramar settings.
All the options can be defined per language (grammar) bases but for now it only supports one language per editor. So it will not support mixed content like html + javascript.
Language specific settings are in your config.cson which you have to edit manually.
You will find most of what you need here
[http://flight-manual.atom.io/using-atom/sections/basic-customization/](http://flight-manual.atom.io/using-atom/sections/basic-customization/)

Notes:

It only works if your code is indented a well formatted. I use [https://atom.io/packages/atom-beautify](https://atom.io/packages/atom-beautify) to achieve this.

Skype on a Mac uses one of the shortcuts (ctrl-alt-cmd-up) globally. So if you find your shortcuts don't work it's most likely because of Skype.

Try it and see. Feel free to suggest and let me know if you have any issues/bugs.
