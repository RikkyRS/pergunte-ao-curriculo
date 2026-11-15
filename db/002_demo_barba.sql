-- =====================================================================
-- DEMO didática: o exemplo da barba com vetores de só 2 números,
-- pra ver a similaridade de cosseno funcionando de verdade no banco.
-- (Não faz parte do produto; é só pra estudar.)
-- =====================================================================
create table if not exists demo_barba (
  texto text,
  vetor vector(2)
);

insert into demo_barba (texto, vetor) values
  ('Barba completa R$45',        '[0.8, 0.2]'),
  ('Horário de funcionamento',   '[0.1, 0.9]'),
  ('Corte + barba R$110',        '[0.7, 0.3]');
