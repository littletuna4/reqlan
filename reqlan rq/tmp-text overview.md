Short for requirements language.
A structured language for composing a graph of natural language ideas in a software project setting, specifically for tracking requirements.
Facilitating the software development [[main/w-model]]
Originally in [this repo](https://github.com/littletuna4/process-twin) now in this [Repo](https://GitHub.com/littletuna4/reqlan)

Idea is essentially a vscode extension supporting lsp. That allows you to quickly skip between files and link and expand on requirements.

"*Semantics engineering*"
Semantic glue layer


A few hooks function views etc
- for get reqs relating to this file.
- View requirements graph.
- Deprecation impacts analysis
- get dates (via git)
- track completion/outstanding/issues
- code -> req comments
	- `# my python comment rq:"./reqfile.rq".dothing`
- import remote requirements
	- e.g. import "https://company.com/reqs/style.rq" as styleguide
	- recommend barrel import for token efficiency
- build docs
	- html export
- export json
- export CSV
	- tags flattened for quick filtering
- ai integration
	- ctrl p: build new requirement
	- crtl p: add to context.
	- ctrl p: write plan

- [ ] Build site
- [ ] domain
- [ ] comment support
- [ ] graph view
- [ ] arbitrary file references

## components and modules spec
- problem
- charter of requirements
- website
- core language spec
	- concepts
		- ideas
		- attributes
			- id (file/alias)
			- body (the main one)
		- graph
		- files
		- references
			- to external files (not necessarily .rq files.)
			- to external files lines
			- to external file symbols
		- imports
			- source file
			- source id/alias
			- aliases
		- render
	- syntax rules
		- keywords
			- import, from, as
		- what defines id/alias
		- attribute marker
			- @
		- bracketing/context rules
		- escaping rules
		- references/
- comprehensive example files set
- extension
	- syntax highlighting support
		- .rq files
			- syntax coverage
		- .* files
			- comment references
	- syntax hovering support
		- show references
	- ide complementary information rendering
		- *i.e. rendering computed information as text in the editor*
		- references
	- ide page report rendering 
		- pages
			- graph
		- components
			- graph
			- local graph
			- status table
	- analysers and functions
		- index ideas
		- list all ideas
	- ide mutation functions
		- create new requirement
		- split requirement
		- copy idea/requirement for each
	- ide command pallete/keyboard shortcuts
		- view all
		- toggle 
		- export to json
		- export to csv
	- mcp
		- provide tools prompt
		- provide keyword search tool
		- provide a requirement tree interrogation description tool 
		- provide a requirement tree summarisation description tool
		- provide an interaction discovery tool
## monetisation
- build tooling
	- ai validation 
	- commit impact analysis
	- compliance 
	- remote connection
- workshops
- sponsorship

## marketing
- positioning
	- software
	- legal
	- compliance
- appeal
	- coverage
	- visibility 
	- not getting swamped
	- ai
		- focus
		- token minimisation
