"""Readers' own sources: feeds and public Telegram channels a reader adds for themselves.

Kept apart from Verilo's rated outlets: never summarised, counted or shown to anyone but the
readers who added them (migration 29). Fetched every FETCH_EVERY with the same care as the
registry's feeds, plus a guard that only public internet addresses are ever fetched, since the
addresses come from readers.
"""
