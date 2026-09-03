export interface ServerOverviewStats {
  total_messages: number;
  total_media: number;
  total_chats: number;
  total_users: number;
  avg_response_time_seconds: number;
  fast_response_percent: number;
  total_conversations_started: number;
  avg_session_duration_minutes: number;
  messages_by_hour: number[];
  messages_by_day_of_week: number[];
  response_time_buckets: {
    under_1_min: number;
    from_1_to_5_min: number;
    from_5_to_30_min: number;
    over_30_min: number;
  };
  top_conversation_starters: Array<{
    user_id: string;
    display_name: string;
    starts_count: number;
    percentage: number;
  }>;
  top_active_chats: Array<{
    chat_id: string;
    title: string;
    type: string;
    message_count: number;
  }>;
}

export interface ChatStats {
  chat_id: string;
  total_messages: number;
  total_media: number;
  total_members: number;
  avg_response_time_seconds: number;
  fastest_responder_name: string;
  fastest_responder_speed: number;
  messages_by_hour: number[];
  top_members: Array<{
    user_id: string;
    display_name: string;
    message_count: number;
    avg_response_time_seconds: number;
  }>;
}

export interface AwardWinner {
  user_id: string;
  display_name: string;
  badge: string;
  description: string;
  value: string;
}

export interface FunAwards {
  night_owl: AwardWinner;
  early_bird: AwardWinner;
  lightning_responder: AwardWinner;
  icebreaker_monarch: AwardWinner;
  novel_writer: AwardWinner;
  one_word_wonder: AwardWinner;
  reaction_magnet: AwardWinner;
  dynamic_duo: {
    user_1_name: string;
    user_2_name: string;
    description: string;
    thread_count: number;
  };
  top_emojis: Array<{
    emoji: string;
    count: number;
  }>;
}

export interface YearWithStovo {
  year: number;
  total_messages: number;
  total_photos: number;
  total_audio: number;
  total_files: number;
  total_conversations_started: number;
  busiest_day: string;
  busiest_day_message_count: number;
  top_conversation_starter_name: string;
  top_conversation_starts: number;
  top_emoji: string;
  top_emoji_count: number;
  personal_card: {
    user_id: string;
    display_name: string;
    superpower_title: string;
    superpower_description: string;
    messages_sent: number;
    fast_replies_count: number;
    avg_response_time_seconds: number;
    top_chat_title: string;
  };
  dynamic_duo: {
    user_1_name: string;
    user_2_name: string;
    description: string;
    thread_count: number;
  };
}
