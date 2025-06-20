import 'server-only';
import { OpenAIStream, StreamingTextResponse } from 'ai';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { Database } from '@/lib/db_types';
import { nanoid } from '@/lib/utils';

export const runtime = 'edge';

export async function POST(req: Request) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient<Database>({
    cookies: () => cookieStore
  });

  const json = await req.json();
  const { messages, previewToken } = json;

  const user = await auth({ cookieStore });
  const userId = user?.user.id;

  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${previewToken || process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages,
      temperature: 0.7,
      stream: true
    })
  });

  const stream = OpenAIStream(response, {
    async onCompletion(completion) {
      const title = messages[0]?.content?.substring(0, 100);
      const id = json.id ?? nanoid();
      const createdAt = Date.now();
      const path = `/chat/${id}`;

      const payload = {
        id,
        title,
        userId,
        createdAt,
        path,
        messages: [
          ...messages,
          {
            content: completion,
            role: 'assistant'
          }
        ]
      };

      await supabase.from('chats').upsert({ id, payload }).throwOnError();
    }
  });

  return new StreamingTextResponse(stream);
}
