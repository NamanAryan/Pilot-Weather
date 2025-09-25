# Pilot Weather App Setup

## Environment Variables

Create a `.env` file in the `frontend/pilot-weather/` directory with the following variables:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
```

## Supabase Setup

1. Create a Supabase project at https://supabase.com
2. Go to Settings > API to find your project URL and anon key
3. Enable Google OAuth in Authentication > Providers
4. Configure the redirect URLs in your Supabase dashboard

## Installation

All required dependencies have been installed:

- **UI Components**: shadcn/ui components with Tailwind CSS
- **Authentication**: Supabase Auth with magic link and Google OAuth
- **Toast Notifications**: Custom toast hook for user feedback

## Features Implemented

✅ **Modern Authentication Form**

- Magic link authentication via email
- Google OAuth integration
- Beautiful UI with shadcn/ui components
- Toast notifications for user feedback

✅ **Dashboard**

- User authentication state management
- Flight route input
- Weather briefing integration with your FastAPI backend
- Responsive design with Tailwind CSS

✅ **Components Created**

- `AuthForm.tsx` - Modern authentication form
- `Dashboard.tsx` - Main application dashboard
- UI components: Button, Input, Label, Card, Separator
- Toast notification system

## Usage

1. Start the development server: `npm run dev`
2. Open your browser to the provided local URL
3. Sign in with email (magic link) or Google OAuth
4. Enter flight routes to get weather briefings

The app will automatically redirect authenticated users to the dashboard and unauthenticated users to the login form.
