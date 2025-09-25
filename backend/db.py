import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if SUPABASE_URL is None or SUPABASE_KEY is None:
	raise ValueError("SUPABASE_URL and SUPABASE_KEY environment variables must be set.")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
