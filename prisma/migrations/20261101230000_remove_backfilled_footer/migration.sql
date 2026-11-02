-- 20261027140000_menu_designs gave every menu that already existed a design holding only the Zymos WiFi
-- footer, so that its print view kept the footer it had always had. That footer is no longer built in, and
-- the default print design is now the Modern design.
--
-- This removes those rows, for the menus whose design is still exactly what that migration made. A design
-- saved from the designer holds a whole design, so it never matches and is left as it is. (A row left as
-- it was would now print as the Modern design plus that footer, because a stored design is read as
-- "the defaults, with these differences".)
DELETE FROM "MenuDesign"
WHERE "view" = 'print'
  AND "spec" = '{"version": 1, "footer": {"show": true, "text": "WiFi Name: Zymos Brewing / Password: @zymos_brew"}}'::jsonb;
