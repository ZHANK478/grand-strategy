revoke execute on function public.add_turns(uuid,integer) from public,anon,authenticated;
revoke execute on function public.spend_turn(uuid,integer) from public,anon,authenticated;
revoke execute on function public.handle_new_user() from public,anon,authenticated;
grant execute on function public.add_turns(uuid,integer) to service_role;
grant execute on function public.spend_turn(uuid,integer) to service_role;
grant execute on function public.handle_new_user() to service_role;
