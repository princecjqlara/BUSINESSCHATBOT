import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { getBestContactTimes } from '@/app/lib/bestContactTimesService';
import { buildContext } from '@/app/lib/mlOnlineLearning';

// GET - Fetch comprehensive lead details
export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // Fetch lead basic information
        const { data: lead, error: leadError } = await supabase
            .from('leads')
            .select('*')
            .eq('id', id)
            .single();

        if (leadError || !lead) {
            return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
        }

        // Fetch best contact times
        let bestContactTimes = null;
        try {
            bestContactTimes = await getBestContactTimes(lead.sender_id, lead.id);
        } catch (error) {
            console.error('Error fetching best contact times:', error);
        }

        // Fetch conversation history
        let conversationHistory: Array<{ role: string; content: string; timestamp: string }> = [];
        try {
            const { data: messages, error: messagesError } = await supabase
                .from('conversations')
                .select('role, content, created_at')
                .eq('sender_id', lead.sender_id)
                .order('created_at', { ascending: true })
                .limit(50);

            if (!messagesError && messages) {
                conversationHistory = messages.map((msg: any) => ({
                    role: msg.role,
                    content: msg.content,
                    timestamp: msg.created_at,
                }));
            }
        } catch (error) {
            console.error('Error fetching conversation history:', error);
        }

        // Fetch ML behavior events
        let mlBehaviorEvents: Array<{
            id: number;
            eventType: string;
            eventData: unknown;
            rewardValue: number | null;
            timestamp: string;
            strategy: { name: string; type: string } | null;
        }> = [];
        try {
            const { data: events, error: eventsError } = await supabase
                .from('ml_behavior_events')
                .select(`
                    id,
                    event_type,
                    event_data,
                    reward_value,
                    created_at,
                    strategy_id,
                    ml_strategies (
                        strategy_name,
                        strategy_type
                    )
                `)
                .eq('lead_id', id)
                .order('created_at', { ascending: false })
                .limit(20);

            if (!eventsError && events) {
                mlBehaviorEvents = events.map((event: any) => {
                    const strategy = Array.isArray(event.ml_strategies)
                        ? event.ml_strategies[0]
                        : event.ml_strategies;

                    return {
                        id: event.id,
                        eventType: event.event_type,
                        eventData: event.event_data,
                        rewardValue: event.reward_value,
                        timestamp: event.created_at,
                        strategy: strategy ? {
                            name: strategy.strategy_name,
                            type: strategy.strategy_type,
                        } : null,
                    };
                });
            }
        } catch (error) {
            console.error('Error fetching ML behavior events:', error);
        }

        // Fetch ML strategy performance for this lead
        let mlStrategyPerformance: Array<{
            strategyId: number;
            strategyName: string;
            strategyType: string;
            strategyDescription: string | null;
            totalUses: number;
            totalReward: number;
            averageReward: number;
            lastUsed: string | null;
        }> = [];
        try {
            // Get context for this lead
            const mlContext = await buildContext(lead.sender_id, lead.id);

            // Fetch all active strategies
            const { data: strategies, error: strategiesError } = await supabase
                .from('ml_strategies')
                .select('id, strategy_name, strategy_type, strategy_description')
                .eq('is_active', true);

            if (!strategiesError && strategies) {
                // For each strategy, get performance data
                const performancePromises = strategies.map(async (strategy: any) => {
                    // Get behavior events for this strategy and lead
                    const { data: strategyEvents, error: strategyEventsError } = await supabase
                        .from('ml_behavior_events')
                        .select('reward_value, created_at')
                        .eq('lead_id', id)
                        .eq('strategy_id', strategy.id)
                        .order('created_at', { ascending: false })
                        .limit(10);

                    if (strategyEventsError) {
                        return null;
                    }

                    const totalUses = strategyEvents?.length || 0;
                    const totalReward = strategyEvents?.reduce((sum: number, e: any) => sum + (Number(e.reward_value) || 0), 0) || 0;
                    const averageReward = totalUses > 0 ? totalReward / totalUses : 0;

                    return {
                        strategyId: strategy.id,
                        strategyName: strategy.strategy_name,
                        strategyType: strategy.strategy_type,
                        strategyDescription: strategy.strategy_description,
                        totalUses,
                        totalReward,
                        averageReward,
                        lastUsed: strategyEvents?.[0]?.created_at || null,
                    };
                });

                const performanceResults = await Promise.all(performancePromises);
                mlStrategyPerformance = performanceResults.filter((p): p is NonNullable<typeof p> => p !== null && p.totalUses > 0);
            }
        } catch (error) {
            console.error('Error fetching ML strategy performance:', error);
        }

        // Build ML context features
        let mlContextFeatures = null;
        try {
            mlContextFeatures = await buildContext(lead.sender_id, lead.id);
        } catch (error) {
            console.error('Error building ML context:', error);
            // Return default context if build fails
            mlContextFeatures = {
                conversationStage: 'greeting',
                messageCount: lead.message_count || 0,
                userType: 'new',
                hasProductInterest: false,
                timeOfDay: 'afternoon',
                dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
            };
        }

        // Fetch goal completions
        let goalCompletions: Array<{
            id: string;
            goalId: string;
            goalName: string;
            goalDescription: string | null;
            priorityOrder: number;
            completedAt: string;
            completionContext: string | null;
        }> = [];
        try {
            const { data: completions, error: completionsError } = await supabase
                .from('lead_goal_completions')
                .select(`
                    id,
                    goal_id,
                    completed_at,
                    completion_context,
                    bot_goals (
                        goal_name,
                        goal_description,
                        priority_order
                    )
                `)
                .eq('lead_id', id)
                .order('completed_at', { ascending: false });

            if (!completionsError && completions) {
                goalCompletions = completions.map((completion: any) => {
                    const goal = Array.isArray(completion.bot_goals)
                        ? completion.bot_goals[0]
                        : completion.bot_goals;

                    return {
                        id: completion.id,
                        goalId: completion.goal_id,
                        goalName: goal?.goal_name || 'Unknown Goal',
                        goalDescription: goal?.goal_description || null,
                        priorityOrder: goal?.priority_order || 0,
                        completedAt: completion.completed_at,
                        completionContext: completion.completion_context,
                    };
                });
            }
        } catch (error) {
            console.error('Error fetching goal completions:', error);
        }

        return NextResponse.json({
            lead: {
                id: lead.id,
                senderId: lead.sender_id,
                name: lead.name,
                phone: lead.phone,
                email: lead.email,
                messageCount: lead.message_count,
                lastMessageAt: lead.last_message_at,
                aiClassificationReason: lead.ai_classification_reason,
                currentStageId: lead.current_stage_id,
                profilePic: lead.profile_pic,
                createdAt: lead.created_at,
                // Contact details
                pageName: (lead as any).page_name || null,
                pageLink: (lead as any).page_link || null,
                businessName: (lead as any).business_name || null,
                decisionMakerName: (lead as any).decision_maker_name || null,
                decisionMakerPosition: (lead as any).decision_maker_position || null,
                additionalContactInfo: (lead as any).additional_contact_info || null,
            },
            bestContactTimes,
            conversationHistory,
            mlBehaviorEvents,
            mlStrategyPerformance,
            mlContextFeatures,
            goalCompletions,
        });
    } catch (error) {
        console.error('Error fetching lead details:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}



