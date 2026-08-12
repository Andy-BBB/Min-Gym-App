const Storage = {
  async loadExercises() {
    if (!workspace.id) {
      throw new Error("Aktivt workspace saknas.");
    }

    const { data, error } = await supabaseClient
      .from("exercise_library")
      .select("id, name")
      .eq("workspace_id", workspace.id)
      .eq("is_archived", false)
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    return data || [];
  },

  async loadPlans() {
    if (!workspace.id) {
      throw new Error("Aktivt workspace saknas.");
    }

    const { data: workoutPlans, error: plansError } =
      await supabaseClient
        .from("workout_plans")
        .select("id, name, sort_order, created_at")
        .eq("workspace_id", workspace.id)
        .eq("is_archived", false)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

    if (plansError) {
      throw plansError;
    }

    if (!workoutPlans.length) {
      return [];
    }

    const planIds = workoutPlans.map(plan => plan.id);

    const { data: planExercises, error: exercisesError } =
      await supabaseClient
        .from("plan_exercises")
        .select(`
          id,
          workout_plan_id,
          exercise_id,
          sort_order,
          exercise_library (
            id,
            name
          )
        `)
        .in("workout_plan_id", planIds)
        .order("sort_order", { ascending: true });

    if (exercisesError) {
      throw exercisesError;
    }

    const planExerciseIds = planExercises.map(exercise => exercise.id);

    let planSets = [];

    if (planExerciseIds.length > 0) {
      const { data: sets, error: setsError } = await supabaseClient
        .from("plan_sets")
        .select(`
          id,
          plan_exercise_id,
          set_number,
          target_weight_kg,
          target_reps
        `)
        .in("plan_exercise_id", planExerciseIds)
        .order("set_number", { ascending: true });

      if (setsError) {
        throw setsError;
      }

      planSets = sets;
    }

    return workoutPlans.map(plan => ({
      id: plan.id,
      name: plan.name,

      exercises: planExercises
        .filter(exercise => exercise.workout_plan_id === plan.id)
        .map(exercise => ({
          id: exercise.id,
          exerciseId:
            exercise.exercise_id || exercise.exercise_library?.id || null,
          name: exercise.exercise_library?.name || "Okänd övning",

          sets: planSets
            .filter(set => set.plan_exercise_id === exercise.id)
            .map(set => ({
              id: set.id,
              weight: Number(set.target_weight_kg || 0),
              reps: Number(set.target_reps || 0)
            }))
        }))
    }));
  },

    // ==============================
  // Medlemmar
  // ==============================

  async inviteMember(workspaceId, email) {
    if (!workspaceId) {
      throw new Error("Aktivt workspace saknas.");
    }

    const normalizedEmail = email?.trim();

    if (!normalizedEmail) {
      throw new Error("E-postadress saknas.");
    }

    const { data: userId, error } = await supabaseClient.rpc(
      "invite_workspace_member",
      {
        p_workspace_id: workspaceId,
        p_email: normalizedEmail
      }
    );

    if (error) {
      throw error;
    }

    return userId;
  },

  async listMembers(workspaceId) {
    if (!workspaceId) {
      throw new Error("Aktivt workspace saknas.");
    }

    const { data, error } = await supabaseClient.rpc(
      "list_workspace_members",
      {
        p_workspace_id: workspaceId
      }
    );

    if (error) {
      throw error;
    }

    return data || [];
  },

  async removeMember(workspaceId, userId) {
    if (!workspaceId) {
      throw new Error("Aktivt workspace saknas.");
    }

    if (!userId) {
      throw new Error("Medlemmens id saknas.");
    }

    const { error } = await supabaseClient.rpc(
      "remove_workspace_member",
      {
        p_workspace_id: workspaceId,
        p_user_id: userId
      }
    );

    if (error) {
      throw error;
    }
  },

    async listMyWorkspaces() {
    const { data, error } =
      await supabaseClient.rpc(
        "list_my_workspaces"
      );

    if (error) {
      throw error;
    }

    return data || [];
  },

  async savePlan(plan) {
    if (!workspace.id) {
      throw new Error("Aktivt workspace saknas.");
    }

    if (!plan?.name) {
      throw new Error("Upplägget saknar namn.");
    }

    if (!Array.isArray(plan.exercises) || plan.exercises.length === 0) {
      throw new Error("Upplägget måste innehålla minst en övning.");
    }

    const exercises = plan.exercises.map(exercise => ({
      exerciseId: exercise.exerciseId || null,
      name: exercise.name,
      createNew: exercise.createNew === true,

      sets: exercise.sets.map(set => ({
        weight: Number(set.weight || 0),
        reps: Number(set.reps || 0)
      }))
    }));

    const { data: planId, error } = await supabaseClient.rpc(
      "save_workout_plan",
      {
        p_workspace_id: workspace.id,
        p_plan_id: plan.id || null,
        p_name: plan.name,
        p_exercises: exercises
      }
    );

    if (error) {
      throw error;
    }

    return planId;
  },

  async deletePlan(planId) {
    if (!workspace.id) {
      throw new Error("Aktivt workspace saknas.");
    }

    if (!planId) {
      throw new Error("Uppläggets id saknas.");
    }

    const { error } = await supabaseClient
      .from("workout_plans")
      .delete()
      .eq("id", planId)
      .eq("workspace_id", workspace.id);

    if (error) {
      throw error;
    }
  },

  async loadSessions() {
  if (!workspace.id) {
    throw new Error("Aktivt workspace saknas.");
  }

  const { data: workoutSessions, error: sessionsError } =
    await supabaseClient
      .from("workout_sessions")
      .select(`
        id,
        workout_plan_id,
        plan_name_snapshot,
        started_at,
        completed_at
      `)
      .eq("workspace_id", workspace.id)
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false });

  if (sessionsError) {
    throw sessionsError;
  }

  if (!workoutSessions.length) {
    return [];
  }

  const sessionIds = workoutSessions.map(session => session.id);

  const { data: sessionExercises, error: exercisesError } =
    await supabaseClient
      .from("session_exercises")
      .select(`
        id,
        workout_session_id,
        exercise_id,
        exercise_name_snapshot,
        sort_order
      `)
      .in("workout_session_id", sessionIds)
      .order("sort_order", { ascending: true });

  if (exercisesError) {
    throw exercisesError;
  }

  const sessionExerciseIds =
    sessionExercises.map(exercise => exercise.id);

  let sessionSets = [];

  if (sessionExerciseIds.length > 0) {
    const { data: sets, error: setsError } =
      await supabaseClient
        .from("session_sets")
        .select(`
          id,
          session_exercise_id,
          set_number,
          weight_kg,
          reps
        `)
        .in("session_exercise_id", sessionExerciseIds)
        .order("set_number", { ascending: true });

    if (setsError) {
      throw setsError;
    }

    sessionSets = sets;
  }

  return workoutSessions.map(session => ({
    id: session.id,
    planId: session.workout_plan_id,
    planName: session.plan_name_snapshot || "Träningspass",
    startedAt: session.started_at,
    completedAt: session.completed_at,
    date: new Date(
      session.completed_at || session.started_at
    ).toLocaleDateString("sv-SE"),

    exercises: sessionExercises
      .filter(exercise => {
        return exercise.workout_session_id === session.id;
      })
      .map(exercise => ({
        id: exercise.id,
        exerciseId: exercise.exercise_id || null,
        name: exercise.exercise_name_snapshot,

        sets: sessionSets
          .filter(set => {
            return set.session_exercise_id === exercise.id;
          })
          .map(set => ({
            id: set.id,
            weight: Number(set.weight_kg || 0),
            reps: Number(set.reps || 0)
          }))
      }))
  }));
},

async saveSession(session) {
  if (!workspace.id) {
    throw new Error("Aktivt workspace saknas.");
  }

  if (!session) {
    throw new Error("Session saknas.");
  }

  const completedExercises = session.exercises.filter(exercise => {
    return exercise.done;
  });

  if (!completedExercises.length) {
    throw new Error(
      "Passet innehåller inga genomförda övningar."
    );
  }

  const payload = completedExercises.map(exercise => ({
    templateExerciseId: exercise.templateExerciseId,
    exerciseId: exercise.exerciseId || null,
    name: exercise.name,
    createNew: exercise.createNew === true,

    sets: exercise.sets.map(set => ({
      weight: Number(set.weight || 0),
      reps: Number(set.reps || 0)
    }))
  }));

  const { data: sessionId, error } = await supabaseClient.rpc(
    "save_workout_session",
    {
      p_workspace_id: workspace.id,
      p_workout_plan_id: session.planId,
      p_plan_name: session.planName,
      p_started_at: session.date,
      p_exercises: payload
    }
  );

  if (error) {
    throw error;
  }

  return sessionId;
}
};

window.Storage = Storage;
