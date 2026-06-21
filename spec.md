## Overview

Reqlan is a language for representing project requirements in text, with support for graph traversal and IDE integrated cross referencing and dependencies.
Allowing for traversal of a requirement graph in an ide using text.
Supporting diffs and version control.
As to support LLM traversal and minimal, but highly robust project management.

Ironically these requirements do not use the language, but this should change as the language develops.

## Key concepts:

- idea
    - The core unit of the language
    - Attributes:
        - name - a unique identifier
        - description
            - a description of the outcome
        - plan
            - an indication of how we plan to get there
        - references
            - may refer to other requirements, requirement attributes, or other folders/files
                - (lsp should confirm file existance and show errors for broken imports) 
            - may be embedded in the description, plan or other fields
            - may be explicitly defined in a field in the idea; or indirectly defined by reference in another idea
                - the exension should have a toggle for showing the indirect references.
            - may be one of:
                - dependency
                - incompatable with
                - applies to
                - related to
            - supports wildcards, and applicatin to namesspaces/ideasets
        - status
        - priority
        - criticality
            - must have
            - should have
            - could have
            - won't have
        - confirmation
        - owner
        - log
        - tags
            - concepts or other simple metadata
            - should autofill based on other tags matching, ordered by proximity
            - some default tags
                - concept
                - definition
                - tenet
                - assertion
                - philosophy
                - speculation
                - nice-to-have
                - deprecated (no longer representative)
                - stub (unspecified)
        - _any arbitrary custom attributes
        -
- ideaset
    - requires a name, (may default to the filename)
    - a collection of ideas, references to ideas, and nested ideasets
    - acts as a namespace container
- file
    - a set of imports
    - an ideaset

## Key Flows:

- Core language:
    - Write a spec file
    - trace a dependency/reference
- Extension features
    - Hovering on an idea should bring up a text summary of the content of that namespace/idea/attribute. (statically ) 
    - Autoformating
- code commenting
    - reqlan ideas should be linked via comments in arbitrary languages.
    - this should use the rq: sy

## Syntax

### File:

File suffix is .rq

### Front matter

\-

### imports:

Pythonic import ergonomics

- `import "{relative_path name}".{ideaset}.{idea}`: import a specific idea
- `import "{relative_path name}".{ideaset}.{idea} as myideaalias`: import a specific idea with an alias
- `from "{relative_path_name}" import {idea}`: also import a specific idea
- `from "{relative_path_name}" import {idea} as myidea`: import a specific idea with an alias
- `import "{relative_path_name}"` import an ideaset namespace
- `import "{relative_path_name}" as myideasetalias` import namespace

### feature syntax

- References are notated with square brackets
    - [ideaset]
    - [idea]
    - [ideaset.idea]
    - [idea.attribute]
- Meta comments are discourage, but can use // and /** */
- code snippets supported with triple backticks.
- Multiline comments are allowed


### config

IDE config should be handled with 


## Extension features