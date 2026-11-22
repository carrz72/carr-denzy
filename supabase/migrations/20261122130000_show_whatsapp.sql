-- The owner's on/off switch for the WhatsApp button on the public site.
-- Off by default: the button only appears once it is switched on in Settings.
begin;

alter table settings
  add column if not exists show_whatsapp boolean not null default false;

commit;
