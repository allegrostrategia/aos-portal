-- aOS — a third kind of Archivio entry: a saved template.
--
-- L'Editoriale redesign brief, §6: "the member can save a screenshot of
-- something they built in Tools (e.g. a pricing structure) into their
-- archive." Its own source value, because it is neither a build nor an SOP —
-- it is a picture with a name.
--
-- On its own in this file: a value added to an enum cannot be used in the
-- same transaction that added it, and the CLI runs each migration as one. The
-- column, constraint and policies that use it are in the next file.

alter type public.handover_source add value 'template';
